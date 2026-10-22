import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { streak, weekStart } from "./life.ts";
import { setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup(); });
afterEach(() => t.dispose());

const state = async () => (await t.inject("/api/state")).json() as Promise<any>;
const send = (method: string, url: string, payload?: unknown) => t.inject({ method, url, payload });
const TODAY = "2026-10-22"; // the test clock: Thursday, IST

describe("streak and week", () => {
  it("counts days in a row ending today, or yesterday while today is open", () => {
    expect(streak(new Set(["2026-10-22", "2026-10-21", "2026-10-20"]), TODAY)).toBe(3);
    expect(streak(new Set(["2026-10-21", "2026-10-20"]), TODAY)).toBe(2);
    expect(streak(new Set(["2026-10-20"]), TODAY)).toBe(0);
    expect(streak(new Set(["2026-10-22", "2026-10-20"]), TODAY)).toBe(1);
    expect(streak(new Set(), TODAY)).toBe(0);
  });

  it("weeks run Monday to Sunday", () => {
    expect(weekStart("2026-10-22")).toBe("2026-10-19");
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
  });
});

describe("habits", () => {
  it("starts with workout and screen-time, nothing done", async () => {
    const { habits } = await state();
    expect(habits.map((h: any) => h.name)).toEqual(["Workout / movement", "Screen-time limit"]);
    expect(habits.every((h: any) => h.today === 0 && h.streak === 0 && h.last7.every((d: boolean) => !d))).toBe(true);
  });

  it("ticking today and a past day builds the streak, and clearing removes it", async () => {
    const id = (await state()).habits[0].id;
    await send("PUT", `/api/habits/${id}/log`, { value: 1 });
    await send("PUT", `/api/habits/${id}/log`, { value: 1, day: "2026-10-21" });
    let h = (await state()).habits[0];
    expect(h).toMatchObject({ today: 1, streak: 2 });
    expect(h.last7.slice(-2)).toEqual([true, true]);
    await send("PUT", `/api/habits/${id}/log`, { value: 0 });
    h = (await state()).habits[0];
    expect(h).toMatchObject({ today: 0, streak: 1 }); // yesterday still counts while today is open
  });

  it("a counter only counts as done once it reaches its goal", async () => {
    const res = await send("POST", "/api/habits", { name: "Water", kind: "count", goal: 8 });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as any).id;
    await send("PUT", `/api/habits/${id}/log`, { value: 5 });
    let s = await state();
    let water = s.habits.find((h: any) => h.id === id);
    expect(water).toMatchObject({ kind: "count", goal: 8, today: 5, streak: 0 });
    expect(s.habitDays).toEqual([]);
    await send("PUT", `/api/habits/${id}/log`, { value: 8 });
    s = await state();
    water = s.habits.find((h: any) => h.id === id);
    expect(water).toMatchObject({ today: 8, streak: 1 });
    expect(s.habitDays).toEqual([{ day: TODAY, done: 1 }]);
  });

  it("rejects bad input", async () => {
    const id = (await state()).habits[0].id;
    expect((await send("POST", "/api/habits", { name: "  " })).status).toBe(400);
    expect((await send("POST", "/api/habits", { name: "x", kind: "weird" })).status).toBe(400);
    expect((await send("POST", "/api/habits", { name: "x", kind: "count", goal: 0 })).status).toBe(400);
    expect((await send("PUT", `/api/habits/${id}/log`, { value: -1 })).status).toBe(400);
    expect((await send("PUT", `/api/habits/${id}/log`, { value: 1, day: "2026-10-23" })).status).toBe(400); // the future
    expect((await send("PUT", `/api/habits/${id}/log`, { value: 1, day: "2026-09-01" })).status).toBe(400); // too far back
    expect((await send("PUT", "/api/habits/9999/log", { value: 1 })).status).toBe(404);
    expect((await send("PATCH", "/api/habits/9999", { name: "y" })).status).toBe(404);
  });

  it("renames, changes a counter's goal, and deleting a habit deletes its log", async () => {
    const id = (((await (await send("POST", "/api/habits", { name: "Water", kind: "count", goal: 8 })).json()) as any).id) as number;
    await send("PUT", `/api/habits/${id}/log`, { value: 3 });
    await send("PATCH", `/api/habits/${id}`, { name: "Water glasses", goal: 6 });
    expect((await state()).habits.find((h: any) => h.id === id)).toMatchObject({ name: "Water glasses", goal: 6, today: 3 });
    expect((await send("DELETE", `/api/habits/${id}`)).status).toBe(200);
    expect((await state()).habits.some((h: any) => h.id === id)).toBe(false);
    expect((await send("DELETE", `/api/habits/${id}`)).status).toBe(404);
  });
});

describe("quick capture", () => {
  it("saves notes and to-dos, newest first, and they can be ticked, edited and deleted", async () => {
    await send("POST", "/api/captures", { text: "  idea for the science fair  " });
    const todo = ((await (await send("POST", "/api/captures", { text: "Buy graph paper", kind: "todo" })).json()) as any).id;
    let { captures } = await state();
    expect(captures.map((c: any) => c.text)).toEqual(["Buy graph paper", "idea for the science fair"]);
    expect(captures[0]).toMatchObject({ kind: "todo", done: false });
    await send("PATCH", `/api/captures/${todo}`, { done: true, text: "Buy graph paper (A3)" });
    captures = (await state()).captures;
    expect(captures[0]).toMatchObject({ done: true, text: "Buy graph paper (A3)" });
    expect((await send("DELETE", `/api/captures/${todo}`)).status).toBe(200);
    expect((await state()).captures).toHaveLength(1);
  });

  it("rejects empty, huge and unknown-kind captures", async () => {
    expect((await send("POST", "/api/captures", { text: "   " })).status).toBe(400);
    expect((await send("POST", "/api/captures", { text: "x".repeat(501) })).status).toBe(400);
    expect((await send("POST", "/api/captures", { text: "ok", kind: "email" })).status).toBe(400);
    expect((await send("PATCH", "/api/captures/999", { done: true })).status).toBe(404);
  });
});

describe("projects", () => {
  it("tracks milestones, and deleting a project deletes them", async () => {
    const pid = ((await (await send("POST", "/api/projects", { name: " Learn guitar ", detail: "one song by March" })).json()) as any).id;
    const m1 = ((await (await send("POST", `/api/projects/${pid}/milestones`, { title: "Three chords" })).json()) as any).id;
    await send("POST", `/api/projects/${pid}/milestones`, { title: "First full song" });
    await send("PATCH", `/api/milestones/${m1}`, { done: true });
    const p = (await state()).projects[0];
    expect(p).toMatchObject({ name: "Learn guitar", detail: "one song by March" });
    expect(p.milestones.map((m: any) => [m.title, m.done])).toEqual([["Three chords", true], ["First full song", false]]);
    expect((await send("DELETE", `/api/projects/${pid}`)).status).toBe(200);
    expect((await state()).projects).toEqual([]);
    expect((await send("PATCH", `/api/milestones/${m1}`, { done: false })).status).toBe(404);
  });

  it("rejects bad input", async () => {
    expect((await send("POST", "/api/projects", { name: "" })).status).toBe(400);
    expect((await send("POST", "/api/projects/999/milestones", { title: "x" })).status).toBe(404);
    expect((await send("PATCH", "/api/projects/999", { name: "x" })).status).toBe(404);
    expect((await send("DELETE", "/api/milestones/999")).status).toBe(404);
  });
});

describe("routine and weekly review", () => {
  it("starts empty, and each call changes only the fields it sends", async () => {
    expect((await state()).routine).toMatchObject({ day: TODAY, sleep: null, kickoffAt: null, wins: "", shutdownAt: null });
    await send("PUT", "/api/routine", { sleep: 4, kickoff: true });
    await send("PUT", "/api/routine", { wins: " Finished Maths ch 3 ", tomorrow: "Physics revision" });
    let r = (await state()).routine;
    expect(r).toMatchObject({ sleep: 4, wins: "Finished Maths ch 3", tomorrow: "Physics revision", shutdownAt: null });
    expect(r.kickoffAt).toBe("2026-10-22T06:00:00.000Z");
    await send("PUT", "/api/routine", { shutdown: true, kickoff: false, sleep: null });
    r = (await state()).routine;
    expect(r).toMatchObject({ sleep: null, kickoffAt: null, wins: "Finished Maths ch 3" });
    expect(r.shutdownAt).toBe("2026-10-22T06:00:00.000Z");
  });

  it("keeps a sleep history for the review", async () => {
    await send("PUT", "/api/routine", { sleep: 3 });
    expect((await state()).routines).toEqual([{ day: TODAY, sleep: 3 }]);
  });

  it("rejects an out-of-range sleep rating and oversize notes", async () => {
    expect((await send("PUT", "/api/routine", { sleep: 6 })).status).toBe(400);
    expect((await send("PUT", "/api/routine", { sleep: 0 })).status).toBe(400);
    expect((await send("PUT", "/api/routine", { wins: "x".repeat(1001) })).status).toBe(400);
  });

  it("saves one reflection note per week", async () => {
    expect((await state()).review).toEqual({ weekStart: "2026-10-19", note: "" });
    await send("PUT", "/api/review", { note: "Good week, slept late twice." });
    await send("PUT", "/api/review", { note: "  Good week.  " });
    expect((await state()).review).toEqual({ weekStart: "2026-10-19", note: "Good week." });
    expect((await send("PUT", "/api/review", { note: "x".repeat(2001) })).status).toBe(400);
    expect((await send("PUT", "/api/review", {})).status).toBe(400);
  });
});

describe("backup version 5", () => {
  it("round-trips habits, captures, projects, routine and reviews", async () => {
    const hid = (await state()).habits[0].id;
    await send("PUT", `/api/habits/${hid}/log`, { value: 1 });
    await send("POST", "/api/captures", { text: "remember this" });
    const pid = ((await (await send("POST", "/api/projects", { name: "Fitness" })).json()) as any).id;
    await send("POST", `/api/projects/${pid}/milestones`, { title: "5 km run" });
    await send("PUT", "/api/routine", { sleep: 5, wins: "good day" });
    await send("PUT", "/api/review", { note: "steady" });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    expect(backup.version).toBe(5);
    await send("DELETE", `/api/habits/${hid}`);
    await send("DELETE", `/api/projects/${pid}`);
    await send("PUT", "/api/routine", { sleep: 1 });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    const s = await state();
    expect(s.habits[0]).toMatchObject({ id: hid, today: 1, streak: 1 });
    expect(s.captures[0].text).toBe("remember this");
    expect(s.projects[0].milestones[0].title).toBe("5 km run");
    expect(s.routine).toMatchObject({ sleep: 5, wins: "good day" });
    expect(s.review.note).toBe("steady");
  });

  it("restoring an older backup leaves habits, captures and projects alone", async () => {
    const backup = (await (await t.inject("/api/export")).json()) as any;
    for (const k of ["habits", "habit_log", "projects", "milestones", "captures", "routine", "reviews"]) delete backup[k];
    backup.version = 4;
    await send("POST", "/api/captures", { text: "keep me" });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    const s = await state();
    expect(s.captures.map((c: any) => c.text)).toEqual(["keep me"]);
    expect(s.habits).toHaveLength(2);
  });

  it("rejects a version 5 file that is missing the life tables, without changing anything", async () => {
    const backup = (await (await t.inject("/api/export")).json()) as any;
    delete backup.habits;
    expect((await send("POST", "/api/import", backup)).status).toBe(400);
    expect((await state()).habits).toHaveLength(2);
  });
});
