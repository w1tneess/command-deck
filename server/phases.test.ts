import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup(); });
afterEach(() => t.dispose());

const state = async () => (await t.inject("/api/state")).json() as Promise<any>;
const maths = (s: any) => s.subjects.find((x: any) => x.id === "maths");
const send = (method: string, url: string, payload: unknown) => t.inject({ method, url, payload });

describe("phases", () => {
  const putPhase = (id: string, payload: object) => send("PUT", `/api/phases/${id}`, payload);

  it("seeds four phases, with only PB1 confirmed", async () => {
    const s = await state();
    expect(s.phases.map((p: any) => p.id)).toEqual(["pb1", "pb2", "practicals", "boards"]);
    expect(s.phases[0]).toMatchObject({ confirmed: true, daysLeft: 28, studyDaysLeft: 27 });
    expect(s.phases.slice(1).every((p: any) => !p.confirmed)).toBe(true);
    expect(s.activePhaseId).toBe("pb1");
  });

  it("follows the calendar: PB1 until it ends, then PB2", async () => {
    t.setNow(Date.parse("2026-12-02T06:00:00Z"));
    expect((await state()).activePhaseId).toBe("pb1");
    t.setNow(Date.parse("2026-12-03T06:00:00Z"));
    const s = await state();
    expect(s.activePhaseId).toBe("pb2");
    expect(s.autoPhase).toBe(true);
  });

  it("a manual choice sticks, and clearing it returns to automatic", async () => {
    expect((await send("PUT", "/api/active-phase", { phaseId: "boards" })).status).toBe(200);
    expect(await state()).toMatchObject({ activePhaseId: "boards", autoPhase: false });
    expect((await send("PUT", "/api/active-phase", { phaseId: "nope" })).status).toBe(404);
    await send("PUT", "/api/active-phase", { phaseId: null });
    expect(await state()).toMatchObject({ activePhaseId: "pb1", autoPhase: true });
  });

  it("edits phase dates and confirms them, with validation", async () => {
    expect((await putPhase("pb2", { startsOn: "2027-01-01", endsOn: "2027-01-10", confirmed: true })).status).toBe(200);
    const pb2 = (await state()).phases.find((p: any) => p.id === "pb2");
    expect(pb2).toMatchObject({ startsOn: "2027-01-01", endsOn: "2027-01-10", confirmed: true });
    expect((await putPhase("pb2", { startsOn: "2027-02-01" })).status).toBe(400); // would start after it ends
    expect((await putPhase("pb2", { endsOn: "2026-12-01" })).status).toBe(400); // would end before it starts
    expect((await putPhase("pb2", { startsOn: "soon" })).status).toBe(400);
    expect((await putPhase("nope", { confirmed: true })).status).toBe(404);
  });

  it("keeps a separate exam date per subject per phase", async () => {
    await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: "2026-11-24" });
    await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "boards", date: "2027-03-01" });
    expect(maths(await state()).examDates).toEqual({ pb1: "2026-11-24", boards: "2027-03-01" });
    await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: null });
    expect(maths(await state()).examDates).toEqual({ boards: "2027-03-01" });
    expect((await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "nope", date: "2026-11-24" })).status).toBe(404);
    expect((await send("PUT", "/api/subjects/ghost/exam-date", { phaseId: "pb1", date: "2026-11-24" })).status).toBe(404);
    expect((await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: "tomorrow" })).status).toBe(400);
  });

  it("counts progress only for chapters inside the active phase scope", async () => {
    await send("PATCH", "/api/chapters/maths-1/meta", { scope: "board" });
    await send("PATCH", "/api/chapters/maths-1", { status: "revised" });
    expect(maths(await state()).progressPct).toBe(0); // PB1 does not cover board-only chapters
    await send("PUT", "/api/active-phase", { phaseId: "boards" });
    expect(maths(await state()).progressPct).toBe(Math.round((1 / 14) * 100));
  });
});

describe("chapter scope", () => {
  it("renames and re-tags a chapter, and rejects bad input", async () => {
    expect((await send("PATCH", "/api/chapters/maths-2/meta", { name: "  Polynomials (Ch 2)  ", scope: "pb2" })).status).toBe(200);
    expect(maths(await state()).chapters[1]).toMatchObject({ name: "Polynomials (Ch 2)", scope: "pb2" });
    expect((await send("PATCH", "/api/chapters/maths-2/meta", { scope: "term2" })).status).toBe(400);
    expect((await send("PATCH", "/api/chapters/maths-2/meta", { name: "  " })).status).toBe(400);
    expect((await send("PATCH", "/api/chapters/nope/meta", { name: "x" })).status).toBe(404);
  });

  it("adds a chapter with a scope, defaulting to Unit 1/2", async () => {
    await send("POST", "/api/chapters", { subjectId: "physics", name: "Light", scope: "board" });
    await send("POST", "/api/chapters", { subjectId: "physics", name: "Electricity" });
    const physics = (await state()).subjects.find((x: any) => x.id === "physics");
    expect(physics.chapters.map((c: any) => [c.name, c.scope])).toEqual([["Light", "board"], ["Electricity", "term1"]]);
    expect((await send("POST", "/api/chapters", { subjectId: "physics", name: "x", scope: "weird" })).status).toBe(400);
  });

  it("seeded Maths carries the right scopes", async () => {
    const scopes = maths(await state()).chapters.map((c: any) => c.scope);
    expect(scopes.slice(0, 12).every((x: string) => x === "term1")).toBe(true);
    expect(scopes.slice(12)).toEqual(["pb1", "pb1"]);
  });
});

describe("revision passes", () => {
  const pass = (id: string, n: number | string, done: boolean) => send("PUT", `/api/chapters/${id}/passes/${n}`, { done });

  it("ticks a pass, stamps the revision date, and unticks without erasing it", async () => {
    expect((await pass("maths-1", 2, true)).status).toBe(200);
    let ch = maths(await state()).chapters[0];
    expect(ch.passes).toEqual([null, "2026-10-22", null]);
    expect(ch.lastRevised).toBe("2026-10-22");
    await pass("maths-1", 2, false);
    ch = maths(await state()).chapters[0];
    expect(ch.passes).toEqual([null, null, null]);
    expect(ch.lastRevised).toBe("2026-10-22");
  });

  it("is idempotent and keeps passes independent", async () => {
    await pass("maths-1", 1, true);
    await pass("maths-1", 1, true);
    await pass("maths-1", 3, true);
    expect(maths(await state()).chapters[0].passes).toEqual(["2026-10-22", null, "2026-10-22"]);
  });

  it("rejects an invalid pass number or chapter", async () => {
    expect((await pass("maths-1", 4, true)).status).toBe(400);
    expect((await pass("maths-1", 0, true)).status).toBe(400);
    expect((await pass("maths-1", "x", true)).status).toBe(400);
    expect((await pass("nope", 1, true)).status).toBe(404);
  });
});

describe("backup v2 and v1 upgrade", () => {
  it("round-trips phases, exam dates, passes and the manual phase choice", async () => {
    await send("PUT", "/api/phases/pb2", { startsOn: "2027-01-01", confirmed: true });
    await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: "2026-11-24" });
    await send("PUT", "/api/chapters/maths-1/passes/1", { done: true });
    await send("PUT", "/api/active-phase", { phaseId: "boards" });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    expect(backup.version).toBe(2);
    // undo the changes, then restore
    await send("PUT", "/api/active-phase", { phaseId: null });
    await send("PUT", "/api/chapters/maths-1/passes/1", { done: false });
    await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: null });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    const s = await state();
    expect(s.activePhaseId).toBe("boards");
    expect(s.phases.find((p: any) => p.id === "pb2")).toMatchObject({ startsOn: "2027-01-01", confirmed: true });
    expect(maths(s).examDates).toEqual({ pb1: "2026-11-24" });
    expect(maths(s).chapters[0].passes[0]).toBe("2026-10-22");
  });

  it("upgrades a version 1 backup: earlier becomes term1, exam date moves to PB1, phases are kept", async () => {
    const v2 = (await (await t.inject("/api/export")).json()) as any;
    const v1 = {
      version: 1,
      subjects: v2.subjects.map((s: any) => ({ ...s, exam_date: s.id === "maths" ? "2026-11-24" : null })),
      chapters: v2.chapters.map(({ scope, ...c }: any) => ({ ...c, introduced_in: scope === "term1" ? "earlier" : scope })),
      progress: v2.progress.map((p: any) => (p.chapter_id === "maths-1" ? { ...p, status: "mastered", confidence: 5 } : p)),
      tasks: [{ id: 1, title: "Old task", subject_id: null, kind: "task", due: null, done: 0 }],
      sessions: [],
    };
    expect((await send("POST", "/api/import", v1)).status).toBe(200);
    const s = await state();
    const m = maths(s);
    expect(m.chapters[0]).toMatchObject({ scope: "term1", status: "mastered", confidence: 5 });
    expect(m.chapters[12].scope).toBe("pb1");
    expect(m.examDates).toEqual({ pb1: "2026-11-24" });
    expect(s.phases).toHaveLength(4);
    expect(s.tasks[0].title).toBe("Old task");
  });

  it("rejects a version 1 file with missing lists, and a file with an invalid scope", async () => {
    expect((await send("POST", "/api/import", { version: 1, subjects: [] })).status).toBe(400);
    const v2 = (await (await t.inject("/api/export")).json()) as any;
    const bad = { ...v2, chapters: v2.chapters.map((c: any, i: number) => (i === 0 ? { ...c, scope: "term2" } : c)) };
    expect((await send("POST", "/api/import", bad)).status).toBe(400);
  });
});
