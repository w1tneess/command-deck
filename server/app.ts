import { Hono } from "hono";
import { registerAuth, type Env } from "./auth.ts";
import { SCOPES, STATUSES, activePhase, daysLeft, inScope, progressPct, studyDaysLeft, todayIST, type Scope, type Status } from "./logic.ts";
import { ENERGIES, studyQueue, type Energy } from "./planner.ts";
import { IDLE, settleTimer, startFocus, stopTimer, type SessionLog, type Timer } from "./timer.ts";

// PTM only. Diwali (8-11 Nov) is deliberately absent: those are free study days.
export const NON_STUDY = ["2026-10-31"];

type Row = Record<string, any>;
const KINDS = ["task", "project", "viva", "practical"];
const PASSES = 3; // 1 Concept, 2 PYQs and Exemplar, 3 Sample papers
// Insert order matters (foreign keys); delete runs in reverse.
const TABLES: Record<string, string[]> = {
  phases: ["id", "name", "scope", "starts_on", "ends_on", "confirmed", "pos"],
  subjects: ["id", "name", "grp", "priority"],
  chapters: ["id", "subject_id", "name", "pos", "scope", "confirmed", "source"],
  progress: ["chapter_id", "status", "confidence", "last_revised", "practice_done"],
  passes: ["chapter_id", "pass_no", "done_at"],
  subject_exams: ["subject_id", "phase_id", "date"],
  tasks: ["id", "title", "subject_id", "kind", "due", "done"],
  sessions: ["id", "subject_id", "day", "minutes"],
  daily_targets: ["id", "day", "chapter_id", "title", "done"],
  checkins: ["day", "energy"],
  settings: ["key", "value"],
};
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: unknown): d is string => typeof d === "string" && ISO.test(d) && !Number.isNaN(Date.parse(d));
const validScope = (s: unknown): s is Scope => SCOPES.includes(s as Scope);
const TARGETS_PER_DAY = 3;
const MAX_TARGETS = 8;

/** Everything the planner needs: phases, the active one, and subjects with chapters, passes and exam dates. */
async function loadModel(db: D1Database, t: string) {
  const [phaseRes, chapterRes, passRes, examRes, subjectRes, settingRes] = await db.batch<Row>([
    db.prepare("SELECT id, name, scope, starts_on AS startsOn, ends_on AS endsOn, confirmed FROM phases ORDER BY pos"),
    db.prepare(
      `SELECT c.id, c.subject_id AS subjectId, c.name, c.scope, c.confirmed, c.source,
              p.status, p.confidence, p.last_revised AS lastRevised, p.practice_done AS practiceDone
       FROM chapters c JOIN progress p ON p.chapter_id = c.id ORDER BY c.subject_id, c.pos`,
    ),
    db.prepare("SELECT chapter_id AS chapterId, pass_no AS n, done_at AS doneAt FROM passes"),
    db.prepare("SELECT subject_id AS subjectId, phase_id AS phaseId, date FROM subject_exams"),
    db.prepare("SELECT id, name, grp, priority FROM subjects ORDER BY priority, name"),
    db.prepare("SELECT value FROM settings WHERE key = 'active_phase'"),
  ]);
  const phases = phaseRes.results.map((p) => ({
    ...(p as { id: string; name: string; scope: Scope; startsOn: string; endsOn: string }),
    confirmed: !!p.confirmed,
    daysLeft: daysLeft(p.startsOn, t),
    studyDaysLeft: studyDaysLeft(p.startsOn, t, NON_STUDY),
  }));
  const override = (settingRes.results[0]?.value as string | undefined) ?? null;
  const active = activePhase(phases, t, override);
  const passesOf = (id: string) => {
    const done: (string | null)[] = Array(PASSES).fill(null);
    for (const p of passRes.results) if (p.chapterId === id) done[p.n - 1] = p.doneAt;
    return done;
  };
  const subjects = subjectRes.results.map((s) => {
    const own: Row[] = chapterRes.results
      .filter((ch) => ch.subjectId === s.id)
      .map((ch) => ({ ...ch, confirmed: !!ch.confirmed, passes: passesOf(ch.id) }));
    const scoped = active ? own.filter((ch) => inScope(ch.scope, active.scope as Scope)) : own;
    const examDates = Object.fromEntries(examRes.results.filter((e) => e.subjectId === s.id).map((e) => [e.phaseId, e.date])) as Record<string, string>;
    return { ...(s as { id: string; name: string; grp: string; priority: number }), examDates, chapters: own, progressPct: progressPct(scoped.map((ch) => ch.status as Status)) };
  });
  return { phases, active, autoPhase: !phases.some((p) => p.id === override), subjects };
}
type Model = Awaited<ReturnType<typeof loadModel>>;

/** Suggested chapters for today, in the active phase, shaped by energy. */
function suggest(model: Model, t: string, energy: Energy | null, n: number, exclude: string[]) {
  if (!model.active || n <= 0) return [];
  const chapters = model.subjects.flatMap((s) =>
    s.chapters.map((ch) => ({
      chapterId: ch.id as string, subjectId: s.id as string, title: `${s.name}: ${ch.name}`, priority: s.priority as number,
      confidence: ch.confidence as number, lastRevised: ch.lastRevised as string | null, status: ch.status as Status, scope: ch.scope as Scope,
      examDate: s.examDates[model.active!.id] ?? null,
    })),
  );
  return studyQueue(chapters, model.active as { id: string; startsOn: string; endsOn: string; scope: Scope }, t, energy, n, exclude);
}

async function addChapterTargets(db: D1Database, picks: { chapterId: string; title: string }[], t: string) {
  if (picks.length) await db.batch(picks.map((p) => db.prepare("INSERT INTO daily_targets (day, chapter_id, title) VALUES (?, ?, ?)").bind(t, p.chapterId, p.title)));
}

const energyOn = async (db: D1Database, t: string) => (await db.prepare("SELECT energy FROM checkins WHERE day = ?").bind(t).first<{ energy: Energy }>())?.energy ?? null;

async function loadTimer(db: D1Database): Promise<Timer> {
  const r = await db.prepare("SELECT mode, subject_id AS subjectId, started_at AS startedAt, duration_s AS durationS, round, cycle_day AS cycleDay FROM timer WHERE id = 1").first<Timer>();
  return r ?? IDLE;
}

/**
 * Moves the timer from `before` to `after` and records any finished sessions, as one atomic batch that only
 * applies if the timer is still in the state we read. Two devices racing therefore log a session once.
 */
async function commitTimer(db: D1Database, before: Timer, after: Timer, logs: SessionLog[]) {
  const guard = "EXISTS (SELECT 1 FROM timer WHERE id = 1 AND mode = ? AND started_at IS ?)";
  const res = await db.batch([
    ...logs.map((l) => db.prepare(`INSERT INTO sessions (subject_id, day, minutes) SELECT ?, ?, ? WHERE ${guard}`).bind(l.subjectId, l.day, l.minutes, before.mode, before.startedAt)),
    db.prepare("UPDATE timer SET mode = ?, subject_id = ?, started_at = ?, duration_s = ?, round = ?, cycle_day = ? WHERE id = 1 AND mode = ? AND started_at IS ?")
      .bind(after.mode, after.subjectId, after.startedAt, after.durationS, after.round, after.cycleDay, before.mode, before.startedAt),
  ]);
  return res[res.length - 1].meta.changes === 1;
}

/** Applies anything due (a finished focus is logged, a finished break ends) and returns the current timer. */
async function settleNow(db: D1Database, nowMs: number): Promise<Timer> {
  const cur = await loadTimer(db);
  const { timer, logs } = settleTimer(cur, nowMs);
  if (timer === cur) return cur;
  return (await commitTimer(db, cur, timer, logs)) ? timer : loadTimer(db);
}

const timerView = (t: Timer, nowMs: number) => ({ ...t, endsAt: t.startedAt === null ? null : t.startedAt + t.durationS * 1000, serverNow: nowMs });

export function createApp(opts: { now?: () => number } = {}) {
  const app = new Hono<Env>();
  const now = () => opts.now?.() ?? Date.now();
  const today = () => todayIST(now());
  const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as T;

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Unexpected server error." }, 500);
  });

  registerAuth(app, now);

  app.get("/api/state", async (c) => {
    const t = today();
    const nowMs = now();
    const since = new Date(Date.parse(t + "T00:00:00Z") - 6 * 86_400_000).toISOString().slice(0, 10);
    const since14 = new Date(Date.parse(t + "T00:00:00Z") - 13 * 86_400_000).toISOString().slice(0, 10);
    const db = c.env.DB;
    const timer = await settleNow(db, nowMs); // before the reads, so a just-finished session shows up below
    const model = await loadModel(db, t);

    // First load of the day: suggest today's targets once. The claim is atomic, so two devices opening
    // the app together can't both create a set, and deleting every target keeps them deleted.
    const claim = await db.prepare("INSERT INTO settings (key, value) VALUES ('targets_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value != excluded.value").bind(t).run();
    if (claim.meta.changes === 1) await addChapterTargets(db, suggest(model, t, await energyOn(db, t), TARGETS_PER_DAY, []), t);

    const [taskRes, sessionRes, targetRes, checkinRes] = await db.batch<Row>([
      db.prepare("SELECT id, title, subject_id AS subjectId, kind, due, done FROM tasks ORDER BY done, due IS NULL, due, id"),
      db.prepare("SELECT day, subject_id AS subjectId, SUM(minutes) AS minutes FROM sessions WHERE day >= ? GROUP BY day, subject_id ORDER BY day").bind(since),
      db.prepare("SELECT t.id, t.title, t.chapter_id AS chapterId, c.subject_id AS subjectId, t.done FROM daily_targets t LEFT JOIN chapters c ON c.id = t.chapter_id WHERE t.day = ? ORDER BY t.id").bind(t),
      db.prepare("SELECT day, energy FROM checkins WHERE day >= ? ORDER BY day").bind(since14),
    ]);
    return c.json({
      today: t, phases: model.phases, activePhaseId: model.active?.id ?? null, autoPhase: model.autoPhase, subjects: model.subjects,
      tasks: taskRes.results.map((r) => ({ ...r, done: !!r.done })), sessions: sessionRes.results,
      targets: targetRes.results.map((r) => ({ ...r, done: !!r.done })),
      checkin: (checkinRes.results.find((r) => r.day === t)?.energy as Energy | undefined) ?? null,
      checkins: checkinRes.results,
      timer: timerView(timer, nowMs),
    });
  });

  app.post("/api/timer/start", async (c) => {
    const { subjectId } = await body<{ subjectId?: string }>(c);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(subjectId ?? "").first())) return c.json({ error: "Pick a subject first." }, 404);
    const nowMs = now();
    const cur = await settleNow(db, nowMs);
    const next = startFocus(cur, subjectId!, nowMs);
    if (!next || !(await commitTimer(db, cur, next, []))) return c.json({ error: "A focus session is already running." }, 409);
    return c.json({ timer: timerView(next, nowMs) });
  });

  // Stops a focus (logging the whole minutes so far) or skips a break.
  app.post("/api/timer/stop", async (c) => {
    const db = c.env.DB;
    const nowMs = now();
    const cur = await settleNow(db, nowMs);
    const { timer, logs } = stopTimer(cur, nowMs);
    if (!(await commitTimer(db, cur, timer, logs))) return c.json({ error: "The timer changed on another device. Try again." }, 409);
    return c.json({ logged: logs[0]?.minutes ?? 0, timer: timerView(timer, nowMs) });
  });

  app.post("/api/checkin", async (c) => {
    const { energy } = await body<{ energy?: string }>(c);
    if (!ENERGIES.includes(energy as Energy)) return c.json({ error: "Energy must be low, ok or high." }, 400);
    const t = today();
    const db = c.env.DB;
    await db.batch([
      db.prepare("INSERT INTO checkins (day, energy) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET energy = excluded.energy").bind(t, energy),
      db.prepare("DELETE FROM daily_targets WHERE day = ? AND chapter_id IS NOT NULL AND done = 0").bind(t),
      db.prepare("INSERT INTO settings (key, value) VALUES ('targets_day', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(t),
    ]);
    // Re-suggest only what is still open: finished targets stay, and a custom one never counts toward the three.
    const kept = (await db.prepare("SELECT chapter_id AS id FROM daily_targets WHERE day = ? AND chapter_id IS NOT NULL").bind(t).all<{ id: string }>()).results.map((r) => r.id);
    await addChapterTargets(db, suggest(await loadModel(db, t), t, energy as Energy, TARGETS_PER_DAY - kept.length, kept), t);
    return c.json({ ok: true });
  });

  app.post("/api/targets", async (c) => {
    const { title, chapterId } = await body<{ title?: string; chapterId?: string }>(c);
    const t = today();
    const db = c.env.DB;
    if (((await db.prepare("SELECT COUNT(*) AS n FROM daily_targets WHERE day = ?").bind(t).first<{ n: number }>())?.n ?? 0) >= MAX_TARGETS) return c.json({ error: `That's ${MAX_TARGETS} targets already. Finish or remove one first.` }, 400);
    let label = title?.trim() ?? "";
    if (chapterId) {
      const row = await db.prepare("SELECT c.name AS chapter, s.name AS subject FROM chapters c JOIN subjects s ON s.id = c.subject_id WHERE c.id = ?").bind(chapterId).first<{ chapter: string; subject: string }>();
      if (!row) return c.json({ error: "No such chapter." }, 404);
      label = `${row.subject}: ${row.chapter}`;
    }
    if (!label) return c.json({ error: "Target needs a title." }, 400);
    const r = await db.prepare("INSERT INTO daily_targets (day, chapter_id, title) VALUES (?, ?, ?)").bind(t, chapterId ?? null, label).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/targets/:id", async (c) => {
    const { done } = await body<{ done?: boolean }>(c);
    const r = await c.env.DB.prepare("UPDATE daily_targets SET done = ? WHERE id = ? AND day = ?").bind(done ? 1 : 0, c.req.param("id"), today()).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such target today." }, 404);
  });

  app.delete("/api/targets/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM daily_targets WHERE id = ? AND day = ?").bind(c.req.param("id"), today()).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such target today." }, 404);
  });

  // Swap an open chapter target for the next-best chapter that isn't already planned today.
  app.post("/api/targets/:id/swap", async (c) => {
    const t = today();
    const db = c.env.DB;
    const target = await db.prepare("SELECT id, chapter_id AS chapterId, done FROM daily_targets WHERE id = ? AND day = ?").bind(c.req.param("id"), t).first<{ id: number; chapterId: string | null; done: number }>();
    if (!target) return c.json({ error: "No such target today." }, 404);
    if (!target.chapterId || target.done) return c.json({ error: "Only an unfinished chapter target can be swapped." }, 400);
    const planned = (await db.prepare("SELECT chapter_id AS id FROM daily_targets WHERE day = ? AND chapter_id IS NOT NULL").bind(t).all<{ id: string }>()).results.map((r) => r.id);
    const [pick] = suggest(await loadModel(db, t), t, await energyOn(db, t), 1, planned);
    if (!pick) return c.json({ error: "No other chapters to swap in." }, 409);
    await db.prepare("UPDATE daily_targets SET chapter_id = ?, title = ? WHERE id = ?").bind(pick.chapterId, pick.title, target.id).run();
    return c.json({ ok: true });
  });

  app.put("/api/active-phase", async (c) => {
    const phaseId = (await body<{ phaseId?: string | null }>(c)).phaseId ?? null;
    const db = c.env.DB;
    if (phaseId === null) {
      await db.prepare("DELETE FROM settings WHERE key = 'active_phase'").run();
      return c.json({ ok: true });
    }
    if (!(await db.prepare("SELECT 1 AS ok FROM phases WHERE id = ?").bind(phaseId).first())) return c.json({ error: "No such phase." }, 404);
    await db.prepare("INSERT INTO settings (key, value) VALUES ('active_phase', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(phaseId).run();
    return c.json({ ok: true });
  });

  app.put("/api/phases/:id", async (c) => {
    const { startsOn, endsOn, confirmed } = await body<{ startsOn?: string; endsOn?: string; confirmed?: boolean }>(c);
    if (startsOn !== undefined && !validDate(startsOn)) return c.json({ error: "Use a start date like 2026-11-19." }, 400);
    if (endsOn !== undefined && !validDate(endsOn)) return c.json({ error: "Use an end date like 2026-12-02." }, 400);
    const db = c.env.DB;
    const cur = await db.prepare("SELECT starts_on AS s, ends_on AS e FROM phases WHERE id = ?").bind(c.req.param("id")).first<{ s: string; e: string }>();
    if (!cur) return c.json({ error: "No such phase." }, 404);
    if ((startsOn ?? cur.s) > (endsOn ?? cur.e)) return c.json({ error: "A phase can't end before it starts." }, 400);
    await db.prepare("UPDATE phases SET starts_on = COALESCE(?, starts_on), ends_on = COALESCE(?, ends_on), confirmed = COALESCE(?, confirmed) WHERE id = ?")
      .bind(startsOn ?? null, endsOn ?? null, confirmed === undefined ? null : confirmed ? 1 : 0, c.req.param("id")).run();
    return c.json({ ok: true });
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

  app.patch("/api/chapters/:id/meta", async (c) => {
    const { name, scope } = await body<{ name?: string; scope?: string }>(c);
    if (name !== undefined && !name.trim()) return c.json({ error: "Chapter needs a name." }, 400);
    if (scope !== undefined && !validScope(scope)) return c.json({ error: "Scope must be term1, pb1, pb2 or board." }, 400);
    const r = await c.env.DB.prepare("UPDATE chapters SET name = COALESCE(?, name), scope = COALESCE(?, scope) WHERE id = ?")
      .bind(name?.trim() ?? null, scope ?? null, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such chapter." }, 404);
  });

  // Ticking a revision pass also counts as revising the chapter today; unticking leaves that date alone.
  app.put("/api/chapters/:id/passes/:n", async (c) => {
    const n = Number(c.req.param("n"));
    if (!Number.isInteger(n) || n < 1 || n > PASSES) return c.json({ error: `Pass must be 1 to ${PASSES}.` }, 400);
    const { done } = await body<{ done?: boolean }>(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    if (!(await db.prepare("SELECT 1 AS ok FROM chapters WHERE id = ?").bind(id).first())) return c.json({ error: "No such chapter." }, 404);
    if (done === false) {
      await db.prepare("DELETE FROM passes WHERE chapter_id = ? AND pass_no = ?").bind(id, n).run();
    } else {
      await db.batch([
        db.prepare("INSERT INTO passes (chapter_id, pass_no, done_at) VALUES (?, ?, ?) ON CONFLICT(chapter_id, pass_no) DO UPDATE SET done_at = excluded.done_at").bind(id, n, today()),
        db.prepare("UPDATE progress SET last_revised = ? WHERE chapter_id = ?").bind(today(), id),
      ]);
    }
    return c.json({ ok: true });
  });

  app.post("/api/chapters", async (c) => {
    const { subjectId, name, scope = "term1" } = await body<{ subjectId?: string; name?: string; scope?: string }>(c);
    if (!name?.trim()) return c.json({ error: "Chapter needs a name." }, 400);
    if (!validScope(scope)) return c.json({ error: "Scope must be term1, pb1, pb2 or board." }, 400);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(subjectId ?? "").first())) return c.json({ error: "No such subject." }, 404);
    const max = await db.prepare("SELECT MAX(pos) AS m FROM chapters WHERE subject_id = ?").bind(subjectId).first<{ m: number | null }>();
    const id = `${subjectId}-${crypto.randomUUID().slice(0, 8)}`;
    await db.batch([
      db.prepare("INSERT INTO chapters (id, subject_id, name, pos, scope) VALUES (?,?,?,?,?)").bind(id, subjectId, name.trim(), (max?.m ?? 0) + 1, scope),
      db.prepare("INSERT INTO progress (chapter_id) VALUES (?)").bind(id),
    ]);
    return c.json({ id }, 201);
  });

  app.put("/api/subjects/:id/exam-date", async (c) => {
    const { phaseId, date = null } = await body<{ phaseId?: string; date?: string | null }>(c);
    if (date !== null && !validDate(date)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(c.req.param("id")).first())) return c.json({ error: "No such subject." }, 404);
    if (!(await db.prepare("SELECT 1 AS ok FROM phases WHERE id = ?").bind(phaseId ?? "").first())) return c.json({ error: "No such phase." }, 404);
    if (date === null) {
      await db.prepare("DELETE FROM subject_exams WHERE subject_id = ? AND phase_id = ?").bind(c.req.param("id"), phaseId).run();
    } else {
      await db.prepare("INSERT INTO subject_exams (subject_id, phase_id, date) VALUES (?,?,?) ON CONFLICT(subject_id, phase_id) DO UPDATE SET date = excluded.date")
        .bind(c.req.param("id"), phaseId, date).run();
    }
    return c.json({ ok: true });
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
    return c.json({ version: 3, ...Object.fromEntries(names.map((t, i) => [t, res[i].results])) });
  });

  // Restore replaces everything in one atomic batch. A bad file is rejected before the write, or
  // rolls back during it, so the existing data is never left half-replaced. Version 1 files (before
  // phases and scope tags) are upgraded on the way in.
  app.post("/api/import", async (c) => {
    let b = await body<Row>(c);
    const fail = (msg: string) => c.json({ error: msg }, 400);
    const db = c.env.DB;
    if (b.version !== 1 && b.version !== 2 && b.version !== 3) return fail("This isn't an Exam Tracker backup (wrong or missing version).");
    if (b.version === 1) {
      for (const t of ["subjects", "chapters", "progress", "tasks", "sessions"]) {
        if (!Array.isArray(b[t])) return fail(`Backup is missing the ${t} list.`);
      }
      const phases = (await db.prepare("SELECT id, name, scope, starts_on, ends_on, confirmed, pos FROM phases ORDER BY pos").all<Row>()).results;
      b = {
        version: 2, phases, settings: [], passes: [],
        subjects: b.subjects.map(({ exam_date, ...rest }: Row) => rest),
        subject_exams: b.subjects.filter((s: Row) => s.exam_date).map((s: Row) => ({ subject_id: s.id, phase_id: "pb1", date: s.exam_date })),
        chapters: b.chapters.map(({ introduced_in, ...rest }: Row) => ({ ...rest, scope: introduced_in === "earlier" ? "term1" : introduced_in })),
        progress: b.progress, tasks: b.tasks, sessions: b.sessions,
      };
    }
    // Version 1 and 2 files predate daily targets and check-ins.
    if (b.version < 3) { b.daily_targets ??= []; b.checkins ??= []; }
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
    if (b.chapters.some((ch: Row) => !validScope(ch.scope)) || b.phases.some((p: Row) => !validScope(p.scope))) return fail("Backup has an invalid scope.");
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
