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
    expect(s.subjects).toHaveLength(12);
  });

  it("persists chapter progress and stamps the revision date", async () => {
    await send("PATCH", "/api/chapters/maths-1", { status: "revised", confidence: 4 });
    const m = maths(await state());
    expect(m.chapters[0]).toMatchObject({ status: "revised", confidence: 4, lastRevised: "2026-10-22" });
    expect(m.progressPct).toBe(Math.round((1 / 14) * 100));
  });

  it("changing only confidence leaves status and the revision date alone", async () => {
    await send("PATCH", "/api/chapters/maths-1", { status: "learning" });
    await send("PATCH", "/api/chapters/maths-1", { confidence: 3 });
    expect(maths(await state()).chapters[0]).toMatchObject({ status: "learning", confidence: 3, lastRevised: null });
  });

  it("rejects bad input", async () => {
    expect((await send("PATCH", "/api/chapters/maths-1", { confidence: 9 })).status).toBe(400);
    expect((await send("PATCH", "/api/chapters/maths-1", { status: "done" })).status).toBe(400);
    expect((await send("PATCH", "/api/chapters/nope", { status: "learning" })).status).toBe(404);
    expect((await send("PUT", "/api/subjects/maths/exam-date", { phaseId: "pb1", date: "tomorrow" })).status).toBe(400);
    expect((await send("POST", "/api/sessions", { subjectId: "maths", minutes: 0 })).status).toBe(400);
    expect((await send("POST", "/api/sessions", { subjectId: "ghost", minutes: 10 })).status).toBe(404);
    expect((await t.inject({ method: "POST", url: "/api/tasks", headers: { "content-type": "application/json" }, payload: undefined })).status).toBe(400);
  });

  it("adds chapters, tasks and sessions", async () => {
    await send("POST", "/api/chapters", { subjectId: "physics", name: "Electricity" });
    const created = (await send("POST", "/api/tasks", { title: "Maths portfolio", kind: "project", due: "2026-11-10" })).json() as any;
    await send("PATCH", `/api/tasks/${(await created).id}`, { done: true });
    await send("POST", "/api/sessions", { subjectId: "maths", minutes: 45 });
    const s = await state();
    expect(s.subjects.find((x: any) => x.id === "physics").chapters[0].name).toBe("Electricity");
    expect(s.tasks[0]).toMatchObject({ title: "Maths portfolio", done: true });
    expect(s.sessions).toEqual([{ day: "2026-10-22", subjectId: "maths", minutes: 45 }]);
  });

  it("deletes a task", async () => {
    const { id } = (await (await send("POST", "/api/tasks", { title: "x" })).json()) as any;
    expect((await t.inject({ method: "DELETE", url: `/api/tasks/${id}` })).status).toBe(200);
    expect((await t.inject({ method: "DELETE", url: `/api/tasks/${id}` })).status).toBe(404);
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
    await send("PATCH", "/api/chapters/maths-3", { status: "mastered", confidence: 5 });
    const backup = await (await t.inject("/api/export")).json();
    await send("PATCH", "/api/chapters/maths-3", { status: "not_started", confidence: 1 });
    expect((await send("POST", "/api/import", backup)).status).toBe(200);
    expect(maths(await state()).chapters[2]).toMatchObject({ status: "mastered", confidence: 5 });
  });

  it("rejects a corrupt file without touching existing data", async () => {
    await send("PATCH", "/api/chapters/maths-1", { status: "revised" });
    const backup = (await (await t.inject("/api/export")).json()) as any;
    const cases = [
      { version: 3 },
      { ...backup, tasks: "nope" },
      { ...backup, progress: backup.progress.map((p: any) => ({ ...p, status: "bogus" })) },
      // passes the shape check, then fails a foreign key partway through the atomic write
      { ...backup, chapters: backup.chapters.map((c: any, i: number) => (i === 0 ? { ...c, subject_id: "ghost" } : c)) },
    ];
    for (const payload of cases) expect((await send("POST", "/api/import", payload)).status).toBe(400);
    expect(maths(await state()).chapters[0].status).toBe("revised");
    expect(maths(await state()).chapters).toHaveLength(14);
  });
});
