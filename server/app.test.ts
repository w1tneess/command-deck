import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => { t = await setup(); });
afterEach(() => t.dispose());

const state = async () => (await t.inject("/api/state")).json() as Promise<any>;
const maths = (s: any) => s.subjects.find((x: any) => x.id === "maths");
const send = (method: string, url: string, payload: unknown) => t.inject({ method, url, payload });

describe("api", () => {
  it("reports the PB1 countdown and 14 Maths chapters", async () => {
    const s = await state();
    expect(s.phases[0]).toMatchObject({ id: "pb1", daysLeft: 28, studyDaysLeft: 27 });
    expect(maths(s).chapters).toHaveLength(14);
    expect(s.subjects).toHaveLength(11);
    expect(s.subjects.map((x: any) => x.id)).not.toContain("hindi"); // Bengali is the second language
    expect(s.deliverables.find((d: any) => d.name === "Language projects")).toMatchObject({ subject: "Bengali" });
  });

  it("a revision pass stamps the revision date and starts the chapter", async () => {
    await send("PUT", "/api/chapters/maths-1/passes/1", { done: true });
    const m = maths(await state());
    expect(m.chapters[0]).toMatchObject({ status: "learning", lastRevised: "2026-10-22" });
    expect(m.progressPct).toBeGreaterThan(0);
  });

  it("changing only confidence leaves status and the revision date alone", async () => {
    await send("PUT", "/api/chapters/maths-1/passes/1", { done: true });
    await send("PATCH", "/api/chapters/maths-1", { confidence: 3 });
    expect(maths(await state()).chapters[0]).toMatchObject({ status: "learning", confidence: 3, lastRevised: "2026-10-22" });
  });

  it("ignores a status sent by hand, so status can't drift from the passes", async () => {
    expect((await send("PATCH", "/api/chapters/maths-1", { status: "mastered" })).status).toBe(400); // confidence is the only field
    expect((await send("PATCH", "/api/chapters/maths-1", { status: "mastered", confidence: 2 })).status).toBe(200);
    expect(maths(await state()).chapters[0]).toMatchObject({ status: "not_started", confidence: 2 });
  });

  it("rejects bad input", async () => {
    expect((await send("PATCH", "/api/chapters/maths-1", { confidence: 9 })).status).toBe(400);
    expect((await send("PATCH", "/api/chapters/nope", { confidence: 3 })).status).toBe(404);
    expect((await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: "tomorrow" })).status).toBe(400);
    expect((await send("POST", "/api/sessions", { subjectId: "maths", minutes: 0 })).status).toBe(400);
    expect((await send("POST", "/api/sessions", { subjectId: "ghost", minutes: 10 })).status).toBe(404);
    expect((await t.inject({ method: "POST", url: "/api/deliverables", headers: { "content-type": "application/json" }, payload: undefined })).status).toBe(400);
  });

  it("adds chapters and sessions", async () => {
    await send("POST", "/api/chapters", { subjectId: "physics", name: "Electricity" });
    await send("POST", "/api/sessions", { subjectId: "maths", minutes: 45 });
    const s = await state();
    expect(s.subjects.find((x: any) => x.id === "physics").chapters[0].name).toBe("Electricity");
    expect(s.sessions).toEqual([{ day: "2026-10-22", subjectId: "maths", minutes: 45 }]);
  });

  it("imports official CBSE chapters for a subject and for all subjects", async () => {
    const chemRes = await send("POST", "/api/syllabus/import-official", { subjectId: "chemistry" });
    expect(chemRes.status).toBe(200);
    const chemData = (await chemRes.json()) as any;
    expect(chemData.imported).toBe(4);

    const s = await state();
    const chem = s.subjects.find((x: any) => x.id === "chemistry");
    expect(chem.chapters).toHaveLength(4);
    expect(chem.chapters[0].confirmed).toBe(true);
    expect(chem.chapters[0].source).toContain("CBSE Class 10 Science (Code 086)");

    // User sets confidence = 4 on chapter 0
    await send("PATCH", `/api/chapters/${chem.chapters[0].id}`, { confidence: 4 });
    expect((await state()).subjects.find((x: any) => x.id === "chemistry").chapters[0].confidence).toBe(4);

    // Re-importing is strictly idempotent: 0 imported, confidence preserved
    const reRes = await send("POST", "/api/syllabus/import-official", { subjectId: "chemistry" });
    expect(((await reRes.json()) as any).imported).toBe(0);
    const afterReimport = (await state()).subjects.find((x: any) => x.id === "chemistry");
    expect(afterReimport.chapters).toHaveLength(4);
    expect(afterReimport.chapters[0].confidence).toBe(4); // NOT wiped

    expect((await send("POST", "/api/syllabus/import-official", { subjectId: "nonexistent" })).status).toBe(404);
  });
});

describe("access control", () => {
  it("rejects missing and wrong tokens, accepts the right one", async () => {
    expect((await t.inject({ url: "/api/state", headers: { authorization: "" } })).status).toBe(401);
    expect((await t.inject({ url: "/api/state", headers: { authorization: "Bearer nope" } })).status).toBe(401);
    expect((await t.inject("/api/state")).status).toBe(200);
  });

  it("fails closed when the server has no APP_TOKEN", async () => {
    const open = await setup({ token: null, secret: null });
    try {
      expect((await open.inject("/api/state")).status).toBe(500);
    } finally {
      await open.dispose();
    }
  });
});

describe("backup and restore", () => {
  it("round-trips: export, change, import restores", async () => {
    for (const n of [1, 2, 3]) await send("PUT", `/api/chapters/maths-3/passes/${n}`, { done: true });
    await send("PATCH", "/api/chapters/maths-3", { confidence: 5 });
    const backup = await (await t.inject("/api/export")).json();
    await send("PUT", "/api/chapters/maths-3/passes/3", { done: false });
    await send("PATCH", "/api/chapters/maths-3", { confidence: 1 });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    expect(maths(await state()).chapters[2]).toMatchObject({ status: "mastered", confidence: 5 });
  });

  it("rejects a corrupt file without touching existing data", async () => {
    await send("PUT", "/api/chapters/maths-1/passes/1", { done: true });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    const cases = [
      { version: 99 },
      { ...backup, deliverables: "nope" },
      { ...backup, progress: backup.progress.map((p: any) => ({ ...p, status: "bogus" })) },
      // passes the shape check, then fails a foreign key partway through the atomic write
      { ...backup, chapters: backup.chapters.map((c: any, i: number) => (i === 0 ? { ...c, subject_id: "ghost" } : c)) },
    ];
    for (const payload of cases) expect((await send("POST", "/api/import", payload)).status).toBe(400);
    expect(maths(await state()).chapters[0].status).toBe("learning");
    expect(maths(await state()).chapters).toHaveLength(14);
  });
});
