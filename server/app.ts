import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { STATUSES, daysLeft, inScope, progressPct, studyDaysLeft, todayIST, type Status } from "./logic.ts";

export const EXAMS = [{ id: "pb1", name: "Pre-Boards 1", start: "2026-11-19", end: "2026-12-02" }];
// PTM only. Diwali (8-11 Nov) is deliberately absent: those are free study days.
export const NON_STUDY = ["2026-10-31"];

type Row = Record<string, any>;
const KINDS = ["task", "project", "viva", "practical"];
// Insert order matters (foreign keys); delete runs in reverse.
const TABLES: Record<string, string[]> = {
  subjects: ["id", "name", "grp", "priority", "exam_date"],
  chapters: ["id", "subject_id", "name", "pos", "introduced_in", "confirmed", "source"],
  progress: ["chapter_id", "status", "confidence", "last_revised", "practice_done"],
  tasks: ["id", "title", "subject_id", "kind", "due", "done"],
  sessions: ["id", "subject_id", "day", "minutes"],
};
const ISO =/^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => ISO.test(d) && !Number.isNaN(Date.parse(d));

export function buildApp(db: DatabaseSync, opts: { token?: string; now?: () => number } = {}) {
  const app = Fastify();
  const today = () => todayIST(opts.now?.());

  app.addHook("onRequest", async (req, reply) => {
    if (opts.token && req.url.startsWith("/api") && req.headers.authorization !== `Bearer ${opts.token}`) {
      return reply.code(401).send({ error: "Missing or wrong access token." });
    }
  });

  app.get("/api/state", () => {
    const t = today();
    const exams = EXAMS.map((e) => ({
      ...e,
      daysLeft: daysLeft(e.start, t),
      studyDaysLeft: studyDaysLeft(e.start, t, NON_STUDY),
    }));
    const chapters = db
      .prepare(
        `SELECT c.id, c.subject_id AS subjectId, c.name, c.introduced_in AS introducedIn, c.confirmed, c.source,
                p.status, p.confidence, p.last_revised AS lastRevised, p.practice_done AS practiceDone
         FROM chapters c JOIN progress p ON p.chapter_id = c.id ORDER BY c.subject_id, c.pos`,
      )
      .all() as Row[];
    const subjects = (
      db.prepare("SELECT id, name, grp, priority, exam_date AS examDate FROM subjects ORDER BY priority, name").all() as Row[]
    ).map((s) => {
      const own: Row[] = chapters.filter((c) => c.subjectId === s.id).map((c) => ({ ...c, confirmed: !!c.confirmed }));
      const scoped = own.filter((c) => inScope(c.introducedIn, "pb1"));
      return { ...s, chapters: own, progressPct: progressPct(scoped.map((c) => c.status as Status)) };
    });
    const tasks = (
      db.prepare("SELECT id, title, subject_id AS subjectId, kind, due, done FROM tasks ORDER BY done, due IS NULL, due, id").all() as Row[]
    ).map((r) => ({ ...r, done: !!r.done }));
    const since = new Date(Date.parse(t + "T00:00:00Z") - 6 * 86_400_000).toISOString().slice(0, 10);
    const sessions = db
      .prepare("SELECT day, subject_id AS subjectId, SUM(minutes) AS minutes FROM sessions WHERE day >= ? GROUP BY day, subject_id ORDER BY day")
      .all(since);
    return { today: t, exams, subjects, tasks, sessions };
  });

  app.patch<{ Params: { id: string }; Body: { status?: string; confidence?: number; practiceDone?: number } }>(
    "/api/chapters/:id",
    (req, reply) => {
      const { status, confidence, practiceDone } = req.body ?? {};
      if (status !== undefined && !STATUSES.includes(status as Status)) return reply.code(400).send({ error: "Unknown status." });
      if (confidence !== undefined && !(Number.isInteger(confidence) && confidence >= 1 && confidence <= 5))
        return reply.code(400).send({ error: "Confidence must be 1 to 5." });
      if (practiceDone !== undefined && !(Number.isInteger(practiceDone) && practiceDone >= 0))
        return reply.code(400).send({ error: "Practice count must be 0 or more." });
      const cur = db.prepare("SELECT * FROM progress WHERE chapter_id = ?").get(req.params.id) as Row | undefined;
      if (!cur) return reply.code(404).send({ error: "No such chapter." });
      // Revising (or mastering) a chapter stamps today, so the stale list stays honest.
      const stamp = status === "revised" || status === "mastered" ? today() : cur.last_revised;
      db.prepare("UPDATE progress SET status=?, confidence=?, practice_done=?, last_revised=? WHERE chapter_id=?").run(
        status ?? cur.status,
        confidence ?? cur.confidence,
        practiceDone ?? cur.practice_done,
        stamp,
        req.params.id,
      );
      return { ok: true };
    },
  );

  app.post<{ Body: { subjectId?: string; name?: string; introducedIn?: string } }>("/api/chapters", (req, reply) => {
    const { subjectId, name, introducedIn = "earlier" } = req.body ?? {};
    if (!name?.trim()) return reply.code(400).send({ error: "Chapter needs a name." });
    if (!["earlier", "pb1", "pb2"].includes(introducedIn)) return reply.code(400).send({ error: "introducedIn must be earlier, pb1 or pb2." });
    if (!db.prepare("SELECT 1 FROM subjects WHERE id = ?").get(subjectId ?? "")) return reply.code(404).send({ error: "No such subject." });
    const pos = ((db.prepare("SELECT MAX(pos) AS m FROM chapters WHERE subject_id = ?").get(subjectId ?? "") as Row).m ?? 0) + 1;
    const id = `${subjectId}-${pos}`;
    db.prepare("INSERT INTO chapters (id, subject_id, name, pos, introduced_in) VALUES (?,?,?,?,?)").run(id, subjectId ?? "", name.trim(), pos, introducedIn);
    db.prepare("INSERT INTO progress (chapter_id) VALUES (?)").run(id);
    return reply.code(201).send({ id });
  });

  app.put<{ Params: { id: string }; Body: { date?: string | null } }>("/api/subjects/:id/exam-date", (req, reply) => {
    const date = req.body?.date ?? null;
    if (date !== null && !validDate(date)) return reply.code(400).send({ error: "Use a date like 2026-11-24." });
    const r = db.prepare("UPDATE subjects SET exam_date = ? WHERE id = ?").run(date, req.params.id);
    return r.changes ? { ok: true } : reply.code(404).send({ error: "No such subject." });
  });

  app.post<{ Body: { title?: string; subjectId?: string | null; kind?: string; due?: string | null } }>("/api/tasks", (req, reply) => {
    const { title, subjectId = null, kind = "task", due = null } = req.body ?? {};
    if (!title?.trim()) return reply.code(400).send({ error: "Task needs a title." });
    if (!KINDS.includes(kind)) return reply.code(400).send({ error: "Unknown task kind." });
    if (due !== null && !validDate(due)) return reply.code(400).send({ error: "Use a date like 2026-11-24." });
    const r = db.prepare("INSERT INTO tasks (title, subject_id, kind, due) VALUES (?,?,?,?)").run(title.trim(), subjectId, kind, due);
    return reply.code(201).send({ id: Number(r.lastInsertRowid) });
  });

  app.patch<{ Params: { id: string }; Body: { done?: boolean } }>("/api/tasks/:id", (req, reply) => {
    const r = db.prepare("UPDATE tasks SET done = ? WHERE id = ?").run(req.body?.done ? 1 : 0, req.params.id);
    return r.changes ? { ok: true } : reply.code(404).send({ error: "No such task." });
  });

  app.delete<{ Params: { id: string } }>("/api/tasks/:id", (req, reply) => {
    const r = db.prepare("DELETE FROM tasks WHERE id = ?").run(req.params.id);
    return r.changes ? { ok: true } : reply.code(404).send({ error: "No such task." });
  });

  app.post<{ Body: { subjectId?: string; minutes?: number; day?: string } }>("/api/sessions", (req, reply) => {
    const { subjectId, minutes, day = today() } = req.body ?? {};
    if (!Number.isInteger(minutes) || minutes! < 1 || minutes! > 720) return reply.code(400).send({ error: "Minutes must be 1 to 720." });
    if (!validDate(day)) return reply.code(400).send({ error: "Use a date like 2026-11-24." });
    if (!db.prepare("SELECT 1 FROM subjects WHERE id = ?").get(subjectId ?? "")) return reply.code(404).send({ error: "No such subject." });
    db.prepare("INSERT INTO sessions (subject_id, day, minutes) VALUES (?,?,?)").run(subjectId ?? "", day, minutes!);
    return reply.code(201).send({ ok: true });
  });

  // Whole-database export, so a moved laptop or wiped disk never loses progress.
  app.get("/api/export", () => ({
    version: 1,
    subjects: db.prepare("SELECT * FROM subjects").all(),
    chapters: db.prepare("SELECT * FROM chapters").all(),
    progress: db.prepare("SELECT * FROM progress").all(),
    tasks: db.prepare("SELECT * FROM tasks").all(),
    sessions: db.prepare("SELECT * FROM sessions").all(),
  }));

  // Restore replaces everything in one transaction. A bad file is rejected before or during the
  // write and rolls back, so the existing data is never left half-replaced.
  app.post<{ Body: Row }>("/api/import", { bodyLimit: 5_000_000 }, (req, reply) => {
    const b = req.body ?? {};
    const fail = (msg: string) => reply.code(400).send({ error: msg });
    if (b.version !== 1) return fail("This isn't an Exam Tracker backup (wrong or missing version).");
    for (const [table, cols] of Object.entries(TABLES)) {
      if (!Array.isArray(b[table])) return fail(`Backup is missing the ${table} list.`);
      for (const row of b[table]) {
        if (!row || typeof row !== "object") return fail(`Backup has a bad row in ${table}.`);
        for (const c of cols) {
          if (!(c in row) || !(row[c] === null || ["string", "number"].includes(typeof row[c])))
            return fail(`Backup has a bad "${c}" value in ${table}.`);
        }
      }
    }
    if (b.progress.some((p: Row) => !STATUSES.includes(p.status) || !Number.isInteger(p.confidence) || p.confidence < 1 || p.confidence > 5))
      return fail("Backup has an invalid status or confidence.");
    try {
      db.exec("BEGIN");
      for (const t of [...Object.keys(TABLES)].reverse()) db.exec(`DELETE FROM ${t}`);
      for (const [table, cols] of Object.entries(TABLES)) {
        const ins = db.prepare(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`);
        for (const row of b[table]) ins.run(...cols.map((c) => row[c]));
      }
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      return fail("Backup data is inconsistent, so nothing was changed.");
    }
    return { ok: true };
  });

  const dist = resolve(import.meta.dirname, "../dist");
  if (existsSync(dist)) app.register(fastifyStatic, { root: dist });

  return app;
}
