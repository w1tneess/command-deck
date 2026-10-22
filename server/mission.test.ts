import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup(); });
afterEach(() => t.dispose());

const MIN = 60_000;
const T0 = Date.parse("2026-10-22T06:00:00Z"); // 11:30 IST
const state = async () => (await t.inject("/api/state")).json() as Promise<any>;
const send = (method: string, url: string, payload?: unknown) => t.inject({ method, url, payload });
const advance = (ms: number) => t.setNow(t.now() + ms);
const minutesOn = (s: any, subject = "maths") => s.sessions.filter((x: any) => x.subjectId === subject).reduce((a: number, x: any) => a + x.minutes, 0);

describe("focus timer", () => {
  it("starts a focus round shared through the cloud", async () => {
    const res = await send("POST", "/api/timer/start", { subjectId: "maths" });
    expect(res.status).toBe(200);
    const s = await state();
    expect(s.timer).toMatchObject({ mode: "focus", subjectId: "maths", durationS: 1500, endsAt: T0 + 25 * MIN, serverNow: T0 });
  });

  it("refuses a second start while a focus is running", async () => {
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    expect((await send("POST", "/api/timer/start", { subjectId: "physics" })).status).toBe(409);
  });

  it("rejects a missing or unknown subject", async () => {
    expect((await send("POST", "/api/timer/start", {})).status).toBe(404);
    expect((await send("POST", "/api/timer/start", { subjectId: "ghost" })).status).toBe(404);
  });

  it("logs a finished focus automatically and moves into the break", async () => {
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(26 * MIN);
    const s = await state();
    expect(minutesOn(s)).toBe(25);
    expect(s.timer).toMatchObject({ mode: "break", round: 1, durationS: 300, endsAt: T0 + 30 * MIN });
  });

  it("logs a session even if nobody had the app open, and only once", async () => {
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(3 * 60 * MIN);
    let s = await state();
    expect(minutesOn(s)).toBe(25);
    expect(s.timer).toMatchObject({ mode: "idle", round: 1 });
    s = await state();
    expect(minutesOn(s)).toBe(25);
  });

  it("logs once when several devices load at the same moment", async () => {
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(30 * MIN);
    await Promise.all([state(), state(), state()]);
    expect(minutesOn(await state())).toBe(25);
  });

  it("stops early and logs whole minutes so far", async () => {
    await send("POST", "/api/timer/start", { subjectId: "physics" });
    advance(7 * MIN + 30_000);
    const res = await send("POST", "/api/timer/stop");
    expect((await res.json()) as any).toMatchObject({ logged: 7, timer: { mode: "idle" } });
    const s = await state();
    expect(minutesOn(s, "physics")).toBe(7);
    expect(s.timer.round).toBe(0); // an early stop is not a finished round
  });

  it("logs nothing for under a minute, and skipping a break logs nothing", async () => {
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(40_000);
    expect(((await (await send("POST", "/api/timer/stop")).json()) as any).logged).toBe(0);
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(26 * MIN);
    expect(((await (await send("POST", "/api/timer/stop")).json()) as any).logged).toBe(0); // stopping the break
    expect(minutesOn(await state())).toBe(25);
  });

  it("carries the round count into the next focus and takes a long break after four", async () => {
    for (let round = 1; round <= 4; round++) {
      expect((await send("POST", "/api/timer/start", { subjectId: "maths" })).status).toBe(200);
      advance(26 * MIN);
      const s = await state();
      expect(s.timer.mode).toBe(round === 4 ? "long_break" : "break");
      expect(s.timer.round).toBe(round === 4 ? 0 : round);
    }
    expect(minutesOn(await state())).toBe(100);
  });

  it("attributes a focus to the IST day it ended, across midnight", async () => {
    t.setNow(Date.parse("2026-10-22T18:20:00Z")); // 23:50 IST
    await send("POST", "/api/timer/start", { subjectId: "maths" });
    advance(26 * MIN);
    const s = await state();
    expect(s.today).toBe("2026-10-23");
    expect(s.sessions).toEqual([{ day: "2026-10-23", subjectId: "maths", minutes: 25 }]);
  });
});

describe("daily targets", () => {
  const titles = (s: any) => s.targets.map((x: any) => x.title);

  it("suggests three chapter targets on the first load of the day, once", async () => {
    const s = await state();
    expect(titles(s)).toEqual(["Maths: Real Numbers", "Maths: Polynomials", "Maths: Pair of Linear Equations in Two Variables"]);
    expect(s.targets.every((x: any) => x.chapterId && !x.done)).toBe(true);
    expect(titles(await state())).toHaveLength(3);
  });

  it("makes a fresh set each day and shows only today's", async () => {
    await state();
    advance(24 * 60 * MIN);
    const s = await state();
    expect(s.targets).toHaveLength(3);
    expect(s.today).toBe("2026-10-23");
  });

  it("does not bring targets back after you delete them all", async () => {
    const s = await state();
    for (const x of s.targets) expect((await send("DELETE", `/api/targets/${x.id}`)).status).toBe(200);
    expect((await state()).targets).toEqual([]);
  });

  it("ticks a target off, and rejects an unknown one", async () => {
    const { targets } = await state();
    expect((await send("PATCH", `/api/targets/${targets[0].id}`, { done: true })).status).toBe(200);
    expect((await state()).targets[0].done).toBe(true);
    expect((await send("PATCH", "/api/targets/9999", { done: true })).status).toBe(404);
    expect((await send("DELETE", "/api/targets/9999")).status).toBe(404);
  });

  it("adds custom and chapter targets, and caps the day at eight", async () => {
    await state();
    expect((await send("POST", "/api/targets", { title: "  Finish lab file  " })).status).toBe(201);
    expect((await send("POST", "/api/targets", { chapterId: "maths-9" })).status).toBe(201);
    const s = await state();
    expect(titles(s).slice(3)).toEqual(["Finish lab file", "Maths: Some Applications of Trigonometry"]);
    expect(s.targets[3].chapterId).toBeNull();
    expect((await send("POST", "/api/targets", { title: "  " })).status).toBe(400);
    expect((await send("POST", "/api/targets", { chapterId: "nope" })).status).toBe(404);
    for (let i = 0; i < 3; i++) await send("POST", "/api/targets", { title: `extra ${i}` });
    expect((await send("POST", "/api/targets", { title: "one too many" })).status).toBe(400);
  });

  it("swaps an open chapter target for the next best chapter not already planned", async () => {
    const { targets } = await state();
    expect((await send("POST", `/api/targets/${targets[0].id}/swap`)).status).toBe(200);
    const s = await state();
    expect(titles(s)).toEqual(["Maths: Quadratic Equations", "Maths: Polynomials", "Maths: Pair of Linear Equations in Two Variables"]);
  });

  it("will not swap a custom or finished target, and says when nothing else is left", async () => {
    const { targets } = await state();
    const custom = ((await (await send("POST", "/api/targets", { title: "x" })).json()) as any).id;
    expect((await send("POST", `/api/targets/${custom}/swap`)).status).toBe(400);
    await send("PATCH", `/api/targets/${targets[1].id}`, { done: true });
    expect((await send("POST", `/api/targets/${targets[1].id}/swap`)).status).toBe(400);
    for (let n = 4; n <= 14; n++) for (const pass of [1, 2, 3]) await send("PUT", `/api/chapters/maths-${n}/passes/${pass}`, { done: true });
    expect((await send("POST", `/api/targets/${targets[0].id}/swap`)).status).toBe(409);
  });
});

describe("energy check-in", () => {
  const checkin = (energy: string) => send("POST", "/api/checkin", { energy });
  const titles = (s: any) => s.targets.map((x: any) => x.title);

  it("rejects an unknown energy", async () => {
    expect((await checkin("tired")).status).toBe(400);
  });

  it("low energy swaps open targets for lighter chapters", async () => {
    await send("PATCH", "/api/chapters/maths-5", { confidence: 4 });
    await state();
    expect((await checkin("low")).status).toBe(200);
    const s = await state();
    expect(s.checkin).toBe("low");
    expect(titles(s)[0]).toBe("Maths: Arithmetic Progressions");
    expect(s.targets).toHaveLength(3);
  });

  it("high energy leads with the hardest chapter", async () => {
    await send("PATCH", "/api/chapters/maths-1", { confidence: 4 });
    await send("PATCH", "/api/chapters/maths-2", { confidence: 3 });
    await state();
    await checkin("high");
    const s = await state();
    expect(titles(s)).not.toContain("Maths: Real Numbers"); // confidence 4 is the easiest, so it drops out of the top three
    expect(s.targets).toHaveLength(3);
  });

  it("keeps finished and custom targets, and re-suggests only what is still open", async () => {
    const { targets } = await state();
    await send("PATCH", `/api/targets/${targets[0].id}`, { done: true });
    await send("POST", "/api/targets", { title: "Lab file" });
    await checkin("ok");
    const s = await state();
    const chapterTargets = s.targets.filter((x: any) => x.chapterId);
    expect(chapterTargets).toHaveLength(3);
    expect(chapterTargets.find((x: any) => x.title === "Maths: Real Numbers").done).toBe(true);
    expect(s.targets.filter((x: any) => !x.chapterId).map((x: any) => x.title)).toEqual(["Lab file"]);
  });

  it("is one check-in per day, and the latest wins", async () => {
    await state();
    await checkin("low");
    await checkin("high");
    const s = await state();
    expect(s.checkin).toBe("high");
    expect(s.checkins).toEqual([{ day: "2026-10-22", energy: "high" }]);
    advance(24 * 60 * MIN);
    const next = await state();
    expect(next.checkin).toBeNull();
    expect(next.checkins).toHaveLength(1);
  });
});

describe("backup with targets and check-ins", () => {
  it("exports the current version and round-trips targets and check-ins", async () => {
    await state();
    await send("POST", "/api/checkin", { energy: "low" });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    expect(backup.version).toBe(5);
    expect(backup.daily_targets).toHaveLength(3);
    expect(backup.checkins).toEqual([{ day: "2026-10-22", energy: "low" }]);
    await send("POST", "/api/checkin", { energy: "high" });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    const s = await state();
    expect(s.checkin).toBe("low");
    expect(s.targets).toHaveLength(3);
  });

  it("still restores a version 2 backup, with no targets or check-ins in it", async () => {
    const v3 = (await (await t.inject("/api/export")).json()) as any;
    const { daily_targets, checkins, ...rest } = v3;
    expect((await send("POST", "/api/import", { ...rest, tasks: [], version: 2 })).status).toBe(200);
    expect((await state()).subjects).toHaveLength(11);
  });
});
