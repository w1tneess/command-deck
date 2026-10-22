import { describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";
import { seed } from "./seed.ts";

const NOW = Date.parse("2026-10-22T06:00:00Z");
function setup(token?: string) {
  const db = openDb(":memory:");
  seed(db);
  return { db, app: buildApp(db, { token, now: () => NOW }) };
}
const maths = (s: any) => s.subjects.find((x: any) => x.id === "maths");

describe("api", () => {
  it("reports the PB1 countdown and 14 Maths chapters", async () => {
    const { app } = setup();
    const s = (await app.inject("/api/state")).json();
    expect(s.exams[0]).toMatchObject({ daysLeft: 28, studyDaysLeft: 27 });
    expect(maths(s).chapters).toHaveLength(14);
  });

  it("persists chapter progress and stamps the revision date", async () => {
    const { app } = setup();
    await app.inject({ method: "PATCH", url: "/api/chapters/maths-1", payload: { status: "revised", confidence: 4 } });
    const m = maths((await app.inject("/api/state")).json());
    expect(m.chapters[0]).toMatchObject({ status: "revised", confidence: 4, lastRevised: "2026-10-22" });
    expect(m.progressPct).toBe(Math.round((1 / 14) * 100));
  });

  it("rejects bad input", async () => {
    const { app } = setup();
    const send = (method: "PATCH" | "PUT" | "POST", url: string, payload: object) => app.inject({ method, url, payload });
    expect((await send("PATCH", "/api/chapters/maths-1", { confidence: 9 })).statusCode).toBe(400);
    expect((await send("PATCH", "/api/chapters/maths-1", { status: "done" })).statusCode).toBe(400);
    expect((await send("PATCH", "/api/chapters/nope", { status: "learning" })).statusCode).toBe(404);
    expect((await send("PUT", "/api/subjects/maths/exam-date", { date: "tomorrow" })).statusCode).toBe(400);
    expect((await send("POST", "/api/sessions", { subjectId: "maths", minutes: 0 })).statusCode).toBe(400);
  });

  it("saves an exam date and clears it", async () => {
    const { app } = setup();
    await app.inject({ method: "PUT", url: "/api/subjects/maths/exam-date", payload: { date: "2026-11-24" } });
    expect(maths((await app.inject("/api/state")).json()).examDate).toBe("2026-11-24");
    await app.inject({ method: "PUT", url: "/api/subjects/maths/exam-date", payload: { date: null } });
    expect(maths((await app.inject("/api/state")).json()).examDate).toBeNull();
  });

  it("adds chapters, tasks and sessions", async () => {
    const { app } = setup();
    await app.inject({ method: "POST", url: "/api/chapters", payload: { subjectId: "physics", name: "Electricity" } });
    const t = (await app.inject({ method: "POST", url: "/api/tasks", payload: { title: "Maths portfolio", kind: "project", due: "2026-11-10" } })).json();
    await app.inject({ method: "PATCH", url: `/api/tasks/${t.id}`, payload: { done: true } });
    await app.inject({ method: "POST", url: "/api/sessions", payload: { subjectId: "maths", minutes: 45 } });
    const s = (await app.inject("/api/state")).json();
    expect(s.subjects.find((x: any) => x.id === "physics").chapters[0].name).toBe("Electricity");
    expect(s.tasks[0]).toMatchObject({ title: "Maths portfolio", done: true });
    expect(s.sessions).toEqual([{ day: "2026-10-22", subjectId: "maths", minutes: 45 }]);
  });

  it("requires the token when one is set", async () => {
    const { app } = setup("secret");
    expect((await app.inject("/api/state")).statusCode).toBe(401);
    expect((await app.inject({ url: "/api/state", headers: { authorization: "Bearer secret" } })).statusCode).toBe(200);
  });

  it("seeding twice keeps user progress", async () => {
    const { db, app } = setup();
    await app.inject({ method: "PATCH", url: "/api/chapters/maths-2", payload: { status: "mastered" } });
    seed(db);
    expect(maths((await app.inject("/api/state")).json()).chapters[1].status).toBe("mastered");
  });
});

describe("backup and restore", () => {
  it("round-trips: export, change, import restores", async () => {
    const { app } = setup();
    await app.inject({ method: "PATCH", url: "/api/chapters/maths-3", payload: { status: "mastered", confidence: 5 } });
    const backup = (await app.inject("/api/export")).json();
    await app.inject({ method: "PATCH", url: "/api/chapters/maths-3", payload: { status: "not_started", confidence: 1 } });
    const r = await app.inject({ method: "POST", url: "/api/import", payload: backup });
    expect(r.statusCode).toBe(200);
    expect(maths((await app.inject("/api/state")).json()).chapters[2]).toMatchObject({ status: "mastered", confidence: 5 });
  });

  it("rejects a corrupt file without touching existing data", async () => {
    const { app } = setup();
    await app.inject({ method: "PATCH", url: "/api/chapters/maths-1", payload: { status: "revised" } });
    const backup = (await app.inject("/api/export")).json();
    const cases = [
      { version: 2 },
      { ...backup, tasks: "nope" },
      { ...backup, progress: backup.progress.map((p: any) => ({ ...p, status: "bogus" })) },
      // passes the shape check, fails a foreign key partway through the write
      { ...backup, chapters: backup.chapters.map((c: any, i: number) => (i === 0 ? { ...c, subject_id: "ghost" } : c)) },
    ];
    for (const payload of cases) {
      expect((await app.inject({ method: "POST", url: "/api/import", payload })).statusCode).toBe(400);
    }
    expect(maths((await app.inject("/api/state")).json()).chapters[0].status).toBe("revised");
  });
});
