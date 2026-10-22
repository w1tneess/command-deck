import { Hono } from "hono";
import { STATUSES, daysLeft, inScope, progressPct, studyDaysLeft, todayIST, type Status } from "./logic.ts";

export type Env = { Bindings: { DB: D1Database; APP_TOKEN?: string } };

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
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => ISO.test(d) && !Number.isNaN(Date.parse(d));

/** Hash both sides first so the comparison is constant-time whatever the lengths. */
async function sameToken(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i]; // no early exit, so timing doesn't leak the match length
  return diff === 0;
}

export function createApp(opts: { now?: () => number } = {}) {
  const app = new Hono<Env>();
  const today = () => todayIST(opts.now?.());
  const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as T;

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Unexpected server error." }, 500);
  });

  // Fail closed: with no APP_TOKEN configured the API refuses everything instead of being open.
  app.use("/api/*", async (c, next) => {
    const token = c.env.APP_TOKEN;
    if (!token) return c.json({ error: "Server has no APP_TOKEN set." }, 500);
    if (!(await sameToken(c.req.header("authorization") ?? "", `Bearer ${token}`))) {
      return c.json({ error: "Missing or wrong access token." }, 401);
    }
    await next();
  });

  app.get("/api/state", async (c) => {
    const t = today();
    const since = new Date(Date.parse(t + "T00:00:00Z") - 6 * 86_400_000).toISOString().slice(0, 10);
    const db = c.env.DB;
    const [chapterRes, subjectRes, taskRes, sessionRes] = await db.batch<Row>([
      db.prepare(
        `SELECT c.id, c.subject_id AS subjectId, c.name, c.introduced_in AS introducedIn, c.confirmed, c.source,
                p.status, p.confidence, p.last_revised AS lastRevised, p.practice_done AS practiceDone
         FROM chapters c JOIN progress p ON p.chapter_id = c.id ORDER BY c.subject_id, c.pos`,
      ),
      db.prepare("SELECT id, name, grp, priority, exam_date AS examDate FROM subjects ORDER BY priority, name"),
      db.prepare("SELECT id, title, subject_id AS subjectId, kind, due, done FROM tasks ORDER BY done, due IS NULL, due, id"),
      db.prepare("SELECT day, subject_id AS subjectId, SUM(minutes) AS minutes FROM sessions WHERE day >= ? GROUP BY day, subject_id ORDER BY day").bind(since),
    ]);
    const exams = EXAMS.map((e) => ({ ...e, daysLeft: daysLeft(e.start, t), studyDaysLeft: studyDaysLeft(e.start, t, NON_STUDY) }));
    const subjects = subjectRes.results.map((s) => {
      const own: Row[] = chapterRes.results.filter((ch) => ch.subjectId === s.id).map((ch) => ({ ...ch, confirmed: !!ch.confirmed }));
      const scoped = own.filter((ch) => inScope(ch.introducedIn, "pb1"));
      return { ...s, chapters: own, progressPct: progressPct(scoped.map((ch) => ch.status as Status)) };
    });
    const tasks = taskRes.results.map((r) => ({ ...r, done: !!r.done }));
    return c.json({ today: t, exams, subjects, tasks, sessions: sessionRes.results });
  });

  app.patch("/api/chapters/:id", async (c) => {
    const { status, confidence, practiceDone } = await body<{ status?: string; confidence?: number; practiceDone?: number }>(c);
    if (status !== undefined && !STATUSES.includes(status as Status)) return c.json({ error: "Unknown status." }, 400);
    if (confidence !== undefined && !(Number.isInteger(confidence) && confidence >= 1 && confidence <= 5)) return c.json({ error: "Confidence must be 1 to 5." }, 400);
    if (practiceDone !== undefined && !(Number.isInteger(practiceDone) && practiceDone >= 0)) return c.json({ error: "Practice count must be 0 or more." }, 400);
    // Revising (or mastering) a chapter stamps today, so the stale list stays honest.
    const stamp = status === "revised" || status === "mastered" ? 1 : 0;
    const r = await c.env.DB.prepare(
      `UPDATE progress SET status = COALESCE(?, status), confidence = COALESCE(?, confidence),
         practice_done = COALESCE(?, practice_done), last_revised = CASE WHEN ? THEN ? ELSE last_revised END
       WHERE chapter_id = ?`,
    ).bind(status ?? null, confidence ?? null, practiceDone ?? null, stamp, today(), c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such chapter." }, 404);
  });

  app.post("/api/chapters", async (c) => {
    const { subjectId, name, introducedIn = "earlier" } = await body<{ subjectId?: string; name?: string; introducedIn?: string }>(c);
    if (!name?.trim()) return c.json({ error: "Chapter needs a name." }, 400);
    if (!["earlier", "pb1", "pb2"].includes(introducedIn)) return c.json({ error: "introducedIn must be earlier, pb1 or pb2." }, 400);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(subjectId ?? "").first())) return c.json({ error: "No such subject." }, 404);
    const max = await db.prepare("SELECT MAX(pos) AS m FROM chapters WHERE subject_id = ?").bind(subjectId).first<{ m: number | null }>();
    const id = `${subjectId}-${crypto.randomUUID().slice(0, 8)}`;
    await db.batch([
      db.prepare("INSERT INTO chapters (id, subject_id, name, pos, introduced_in) VALUES (?,?,?,?,?)").bind(id, subjectId, name.trim(), (max?.m ?? 0) + 1, introducedIn),
      db.prepare("INSERT INTO progress (chapter_id) VALUES (?)").bind(id),
    ]);
    return c.json({ id }, 201);
  });

  app.put("/api/subjects/:id/exam-date", async (c) => {
    const date = (await body<{ date?: string | null }>(c)).date ?? null;
    if (date !== null && !validDate(date)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    const r = await c.env.DB.prepare("UPDATE subjects SET exam_date = ? WHERE id = ?").bind(date, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such subject." }, 404);
  });

  app.post("/api/tasks", async (c) => {
    const { title, subjectId = null, kind = "task", due = null } = await body<{ title?: string; subjectId?: string | null; kind?: string; due?: string | null }>(c);
    if (!title?.trim()) return c.json({ error: "Task needs a title." }, 400);
    if (!KINDS.includes(kind)) return c.json({ error: "Unknown task kind." }, 400);
    if (due !== null && !validDate(due)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    const r = await c.env.DB.prepare("INSERT INTO tasks (title, subject_id, kind, due) VALUES (?,?,?,?)").bind(title.trim(), subjectId, kind, due).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/tasks/:id", async (c) => {
    const { done } = await body<{ done?: boolean }>(c);
    const r = await c.env.DB.prepare("UPDATE tasks SET done = ? WHERE id = ?").bind(done ? 1 : 0, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such task." }, 404);
  });

  app.delete("/api/tasks/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such task." }, 404);
  });

  app.post("/api/sessions", async (c) => {
    const { subjectId, minutes, day = today() } = await body<{ subjectId?: string; minutes?: number; day?: string }>(c);
    if (!Number.isInteger(minutes) || minutes! < 1 || minutes! > 720) return c.json({ error: "Minutes must be 1 to 720." }, 400);
    if (!validDate(day)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(subjectId ?? "").first())) return c.json({ error: "No such subject." }, 404);
    await db.prepare("INSERT INTO sessions (subject_id, day, minutes) VALUES (?,?,?)").bind(subjectId, day, minutes).run();
    return c.json({ ok: true }, 201);
  });

  // Whole-database export, so a wiped database or a move to another host never loses progress.
  app.get("/api/export", async (c) => {
    const db = c.env.DB;
    const names = Object.keys(TABLES);
    const res = await db.batch<Row>(names.map((t) => db.prepare(`SELECT * FROM ${t}`)));
    return c.json({ version: 1, ...Object.fromEntries(names.map((t, i) => [t, res[i].results])) });
  });

  // Restore replaces everything in one atomic batch. A bad file is rejected before the write, or
  // rolls back during it, so the existing data is never left half-replaced.
  app.post("/api/import", async (c) => {
    const b = await body<Row>(c);
    const fail = (msg: string) => c.json({ error: msg }, 400);
    if (b.version !== 1) return fail("This isn't an Exam Tracker backup (wrong or missing version).");
    for (const [table, cols] of Object.entries(TABLES)) {
      if (!Array.isArray(b[table])) return fail(`Backup is missing the ${table} list.`);
      for (const row of b[table]) {
        if (!row || typeof row !== "object") return fail(`Backup has a bad row in ${table}.`);
        for (const col of cols) {
          if (!(col in row) || !(row[col] === null || ["string", "number"].includes(typeof row[col]))) return fail(`Backup has a bad "${col}" value in ${table}.`);
        }
      }
    }
    if (b.progress.some((p: Row) => !STATUSES.includes(p.status) || !Number.isInteger(p.confidence) || p.confidence < 1 || p.confidence > 5)) {
      return fail("Backup has an invalid status or confidence.");
    }
    const db = c.env.DB;
    const deletes = Object.keys(TABLES).reverse().map((t) => db.prepare(`DELETE FROM ${t}`));
    const inserts = Object.entries(TABLES).flatMap(([t, cols]) => {
      const sql = `INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
      return (b[t] as Row[]).map((row) => db.prepare(sql).bind(...cols.map((col) => row[col])));
    });
    try {
      await db.batch([...deletes, ...inserts]);
    } catch {
      return fail("Backup data is inconsistent, so nothing was changed.");
    }
    return c.json({ ok: true });
  });

  return app;
}
