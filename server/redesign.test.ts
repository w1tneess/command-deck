import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup(); });
afterEach(() => t.dispose());

const DAY = 86_400_000;
const state = async () => (await t.inject("/api/state")).json() as Promise<any>;
const maths = (s: any) => s.subjects.find((x: any) => x.id === "maths");
const send = (method: string, url: string, payload?: unknown) => t.inject({ method, url, payload });
const pass = (id: string, n: number, done = true) => send("PUT", `/api/chapters/${id}/passes/${n}`, { done });

describe("deliverables", () => {
  const patch = (id: number, payload: object) => send("PATCH", `/api/deliverables/${id}`, payload);

  it("starts with the eight Pre-Boards 1 submissions, none started", async () => {
    const { deliverables } = await state();
    expect(deliverables).toHaveLength(8);
    expect(deliverables.every((d: any) => d.phaseId === "pb1" && d.status === "not_started" && !d.vivaPrep)).toBe(true);
    expect(deliverables.find((d: any) => d.name === "Chemistry practicals")?.due).toBe("2026-10-20");
    expect(deliverables[0]).toMatchObject({ name: "Activity file (portfolio)", subject: "Maths", doneCount: 0, totalCount: 12 });
    expect(deliverables.slice(1).every((d: any) => d.totalCount === null)).toBe(true);
  });

  it("adds a deliverable, with an optional step count and due date", async () => {
    const res = await send("POST", "/api/deliverables", { name: "  Lab manual  ", subject: "Physics", detail: "experiments", totalCount: 8, due: "2026-11-12", phaseId: "pb1" });
    expect(res.status).toBe(201);
    const d = (await state()).deliverables.at(-1);
    expect(d).toMatchObject({ name: "Lab manual", subject: "Physics", detail: "experiments", doneCount: 0, totalCount: 8, due: "2026-11-12", phaseId: "pb1" });
  });

  it("rejects bad input when adding", async () => {
    expect((await send("POST", "/api/deliverables", { subject: "Maths" })).status).toBe(400);
    expect((await send("POST", "/api/deliverables", { name: "x" })).status).toBe(400);
    expect((await send("POST", "/api/deliverables", { name: "x", subject: "y", due: "soon" })).status).toBe(400);
    expect((await send("POST", "/api/deliverables", { name: "x", subject: "y", totalCount: 0 })).status).toBe(400);
    expect((await send("POST", "/api/deliverables", { name: "x", subject: "y", phaseId: "nope" })).status).toBe(404);
  });

  it("sets and clears a due date, and toggles viva prep", async () => {
    const id = (await state()).deliverables[1].id;
    await patch(id, { due: "2026-11-10", vivaPrep: true });
    let d = (await state()).deliverables[1];
    expect(d).toMatchObject({ due: "2026-11-10", vivaPrep: true });
    await patch(id, { name: "Chemistry lab file" }); // leaves the due date alone
    expect((await state()).deliverables[1]).toMatchObject({ name: "Chemistry lab file", due: "2026-11-10" });
    await patch(id, { due: null, vivaPrep: false });
    d = (await state()).deliverables[1];
    expect(d).toMatchObject({ due: null, vivaPrep: false });
  });

  it("moves the status with the step count, unless a status is sent too", async () => {
    const id = (await state()).deliverables[0].id;
    await patch(id, { doneCount: 5 });
    expect((await state()).deliverables[0]).toMatchObject({ doneCount: 5, status: "in_progress" });
    await patch(id, { doneCount: 12 });
    expect((await state()).deliverables[0].status).toBe("done");
    await patch(id, { doneCount: 0 });
    expect((await state()).deliverables[0].status).toBe("not_started");
    await patch(id, { doneCount: 3, status: "done" });
    expect((await state()).deliverables[0]).toMatchObject({ doneCount: 3, status: "done" });
  });

  it("rejects bad updates", async () => {
    const { deliverables } = await state();
    const [counted, plain] = [deliverables[0].id, deliverables[1].id];
    expect((await patch(counted, { doneCount: 13 })).status).toBe(400);
    expect((await patch(counted, { doneCount: -1 })).status).toBe(400);
    expect((await patch(plain, { doneCount: 1 })).status).toBe(400); // nothing to count
    expect((await patch(plain, { status: "finished" })).status).toBe(400);
    expect((await patch(plain, { name: "  " })).status).toBe(400);
    expect((await patch(plain, { due: "next week" })).status).toBe(400);
    expect((await patch(9999, { name: "x" })).status).toBe(404);
  });

  it("deletes a deliverable", async () => {
    const id = (await state()).deliverables[2].id;
    expect((await send("DELETE", `/api/deliverables/${id}`)).status).toBe(200);
    expect((await state()).deliverables).toHaveLength(7);
    expect((await send("DELETE", `/api/deliverables/${id}`)).status).toBe(404);
  });
});

describe("chapter delete, reorder and confirm", () => {
  it("deleting a chapter removes its passes and daily targets, and nothing else", async () => {
    const before = await state(); // today's targets are suggested on this first load
    await pass("maths-1", 1);
    expect(before.targets.some((x: any) => x.chapterId === "maths-1")).toBe(true);
    expect((await send("DELETE", "/api/chapters/maths-1")).status).toBe(200);
    const s = await state();
    expect(maths(s).chapters).toHaveLength(13);
    expect(maths(s).chapters.some((c: any) => c.id === "maths-1")).toBe(false);
    expect(s.targets.some((x: any) => x.chapterId === "maths-1")).toBe(false);
    expect(s.targets.length).toBe(before.targets.length - 1);
    expect((await send("DELETE", "/api/chapters/maths-1")).status).toBe(404);
  });

  it("reorders a subject's chapters", async () => {
    const ids = maths(await state()).chapters.map((c: any) => c.id) as string[];
    const next = [ids[1], ids[0], ...ids.slice(2).reverse()];
    expect((await send("POST", "/api/subjects/maths/reorder", { order: next })).status).toBe(200);
    expect(maths(await state()).chapters.map((c: any) => c.id)).toEqual(next);
  });

  it("rejects an order that is not every chapter exactly once", async () => {
    const ids = maths(await state()).chapters.map((c: any) => c.id) as string[];
    const bad = [
      ids.slice(1), // one missing
      [...ids.slice(1), ids[1]], // a duplicate in place of one
      [...ids.slice(1), "physics-1"], // a chapter from elsewhere
      "maths-1", // not a list
    ];
    for (const order of bad) expect((await send("POST", "/api/subjects/maths/reorder", { order })).status).toBe(400);
    expect(maths(await state()).chapters.map((c: any) => c.id)).toEqual(ids);
  });

  it("keeps new chapters at the end after a delete", async () => {
    await send("DELETE", "/api/chapters/maths-3");
    await send("POST", "/api/chapters", { subjectId: "maths", name: "Extra" });
    const names = maths(await state()).chapters.map((c: any) => c.name);
    expect(names.at(-1)).toBe("Extra");
    expect(names).toHaveLength(14);
  });

  it("marks a whole subject as checked, and can undo it", async () => {
    expect(maths(await state()).chapters.every((c: any) => !c.confirmed)).toBe(true);
    expect((await send("PUT", "/api/subjects/maths/confirmed", { confirmed: true })).status).toBe(200);
    expect(maths(await state()).chapters.every((c: any) => c.confirmed)).toBe(true);
    await send("PUT", "/api/subjects/maths/confirmed", { confirmed: false });
    expect(maths(await state()).chapters.every((c: any) => !c.confirmed)).toBe(true);
    expect((await send("PUT", "/api/subjects/ghost/confirmed", { confirmed: true })).status).toBe(404);
  });
});

describe("passes drive progress and status", () => {
  it("counts a chapter as started once any pass is done", async () => {
    expect(maths(await state()).progressPct).toBe(0);
    await pass("maths-1", 1);
    await pass("maths-2", 3);
    expect(maths(await state()).progressPct).toBe(Math.round((2 / 14) * 100));
    await pass("maths-2", 3, false);
    expect(maths(await state()).progressPct).toBe(Math.round((1 / 14) * 100));
  });

  it("keeps a derived status: learning with some passes, mastered with all three", async () => {
    await pass("maths-1", 1);
    expect(maths(await state()).chapters[0].status).toBe("learning");
    await pass("maths-1", 2);
    await pass("maths-1", 3);
    expect(maths(await state()).chapters[0].status).toBe("mastered");
    await pass("maths-1", 2, false);
    expect(maths(await state()).chapters[0].status).toBe("learning");
    await pass("maths-1", 1, false);
    await pass("maths-1", 3, false);
    expect(maths(await state()).chapters[0].status).toBe("not_started");
  });

  it("a chapter with all three passes leaves tomorrow's targets", async () => {
    for (const n of [1, 2, 3]) await pass("maths-1", n);
    t.setNow(t.now() + DAY);
    const s = await state();
    expect(s.targets.some((x: any) => x.chapterId === "maths-1")).toBe(false);
    expect(s.targets).toHaveLength(3);
  });
});

describe("study heatmap data", () => {
  it("sums minutes per day across subjects, and ignores anything older than 90 days", async () => {
    const log = (day: string, subjectId: string, minutes: number) => send("POST", "/api/sessions", { subjectId, minutes, day });
    await log("2026-10-20", "maths", 40);
    await log("2026-10-20", "physics", 25);
    await log("2026-10-22", "maths", 60);
    await log("2026-06-01", "maths", 90); // 143 days ago
    const { heat } = await state();
    expect(heat).toEqual([{ day: "2026-10-20", minutes: 65 }, { day: "2026-10-22", minutes: 60 }]);
  });
});

describe("backup version 4", () => {
  it("round-trips deliverable edits", async () => {
    const id = (await state()).deliverables[1].id;
    await send("PATCH", `/api/deliverables/${id}`, { due: "2026-11-10", vivaPrep: true, status: "in_progress" });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    expect(backup.deliverables).toHaveLength(8);
    await send("PATCH", `/api/deliverables/${id}`, { due: null, vivaPrep: false, status: "not_started" });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    expect((await state()).deliverables[1]).toMatchObject({ due: "2026-11-10", vivaPrep: true, status: "in_progress" });
  });

  it("upgrades a version 3 file: term1 becomes unit1 and tasks become deliverables, keeping the current submissions", async () => {
    const v4 = (await (await t.inject("/api/export")).json()) as any;
    const { deliverables, ...rest } = v4;
    const v3 = {
      ...rest,
      version: 3,
      chapters: v4.chapters.map((c: any) => ({ ...c, scope: c.scope === "unit1" || c.scope === "unit2" ? "term1" : c.scope })),
      tasks: [
        { id: 7, title: "Lab file", subject_id: "physics", kind: "practical", due: "2026-11-05", done: 1 },
        { id: 8, title: "Reading log", subject_id: null, kind: "task", due: null, done: 0 },
      ],
    };
    expect((await send("POST", "/api/import", v3)).status).toBe(200);
    const s = await state();
    expect(maths(s).chapters.map((c: any) => c.scope).slice(0, 12).every((x: string) => x === "unit1")).toBe(true);
    expect(s.deliverables).toHaveLength(10);
    expect(s.deliverables.slice(-2)).toMatchObject([
      { name: "Lab file", subject: "Physics", detail: "practical", status: "done", due: "2026-11-05" },
      { name: "Reading log", subject: "General", detail: "task", status: "not_started", due: null },
    ]);
  });

  it("rejects a version 3 file without a task list, and an invalid deliverable status", async () => {
    const v4 = (await (await t.inject("/api/export")).json()) as any;
    const { deliverables, ...rest } = v4;
    expect((await send("POST", "/api/import", { ...rest, version: 3 })).status).toBe(400);
    const bad = { ...v4, deliverables: v4.deliverables.map((d: any, i: number) => (i === 0 ? { ...d, status: "finished" } : d)) };
    expect((await send("POST", "/api/import", bad)).status).toBe(400);
  });
});
