import { Hono, type Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { registerAuth, type Env, hasValidSession, isLocalDev, same } from "./auth.ts";
import { SCOPES, STATUSES, activePhase, computeChapterDuration, daysLeft, inScope, startedPct, studyDaysLeft, todayIST, type Scope, type Status } from "./logic.ts";
import { lifeState, registerLife } from "./life.ts";
import { ENERGIES, studyQueue, type Energy } from "./planner.ts";
import { IDLE, settleTimer, startFocus, stopTimer, type SessionLog, type Timer } from "./timer.ts";
import { OFFICIAL_CURRICULUM } from "./curriculum.ts";
import { generateIcsFeed, shiftTimeStr, type ScheduleBlock } from "./calendar.ts";
import {
  buildGoogleAuthUrl,
  detectScheduleConflicts,
  exchangeGoogleAuthCode,
  getGoogleCredentials,
  pullGoogleEvents,
  pushBlockToGoogle,
  deleteGoogleCalendarEvent,
  createCalendarEvent,
  hasCalendarScope,
  isAuthFailure,
  listCalendarEvents,
  removeCalendarEvent,
  selectCalendar,
  updateCalendarEvent,
  type CalendarEventInput,
  type ExternalEvent,
} from "./google-calendar.ts";

export const DEFAULT_SCHEDULE_BLOCKS: Omit<ScheduleBlock, "id">[] = [
  { title: "Morning Deep Work", category: "morning", startTime: "07:00", endTime: "08:30", color: "#38bdf8", pos: 1 },
  { title: "School & Lab Sessions", category: "school", startTime: "08:45", endTime: "14:30", color: "#f59e0b", pos: 2 },
  { title: "Afternoon Revision & Formula Prep", category: "revision", startTime: "15:30", endTime: "17:00", color: "#818cf8", pos: 3 },
  { title: "Evening Problem Solving & PYQs", category: "practice", startTime: "17:30", endTime: "19:30", color: "#a855f7", pos: 4 },
  { title: "Routine Review & Wind Down", category: "winddown", startTime: "21:00", endTime: "22:00", color: "#ec4899", pos: 5 },
];

// PTM only. Diwali (8-11 Nov) is deliberately absent: those are free study days.
export const NON_STUDY = ["2026-10-31"];

type Row = Record<string, any>;
const DELIVERABLE_STATUSES = ["not_started", "in_progress", "done"];
const PASSES = 3; // 1 Concept, 2 PYQs and Exemplar, 3 Sample papers
// Insert order matters (foreign keys); delete runs in reverse.
const TABLES: Record<string, string[]> = {
  phases: ["id", "name", "scope", "starts_on", "ends_on", "confirmed", "pos"],
  subjects: ["id", "name", "grp", "priority"],
  chapters: ["id", "subject_id", "name", "pos", "scope", "confirmed", "source"],
  progress: ["chapter_id", "status", "confidence", "last_revised", "practice_done"],
  passes: ["chapter_id", "pass_no", "done_at"],
  subject_exams: ["subject_id", "phase_id", "date"],
  deliverables: ["id", "name", "subject", "detail", "phase_id", "status", "done_count", "total_count", "due", "viva_prep"],
  sessions: ["id", "subject_id", "day", "minutes"],
  daily_targets: ["id", "day", "chapter_id", "title", "done"],
  checkins: ["day", "energy"],
  settings: ["key", "value"],
  habits: ["id", "name", "kind", "goal", "pos"],
  habit_log: ["habit_id", "day", "value"],
  projects: ["id", "name", "detail", "pos"],
  milestones: ["id", "project_id", "title", "done", "pos"],
  captures: ["id", "text", "kind", "done", "created_at"],
  routine: ["day", "sleep", "kickoff_at", "wins", "tomorrow", "shutdown_at"],
  reviews: ["week_start", "note"],
  schedule_blocks: ["id", "title", "category", "start_time", "end_time", "color", "pos"],
  external_events: ["id", "summary", "description", "starts_at", "ends_at", "is_study_block", "updated_at"],
};
/** Columns added by later migrations. A backup written before them lacks them, so they are optional on restore and take this value. */
const OPTIONAL_COLS: Record<string, Record<string, string | null>> = {
  progress: { notes: "" },
  sessions: { note: null },
  daily_targets: { duration: "45m", subject_id: null },
  deliverables: { gcal_event_id: null },
  schedule_blocks: { gcal_event_id: null, gcal_event_day: null },
};
/** google_sync is deliberately absent from TABLES: its OAuth tokens must never be written to (or planted from) a backup file. */
/**
 * Settings that never travel in a backup file: Google credentials, the sign-in allowlist, the calendar feed token and
 * in-flight sign-in state. They are left out of an export, and a restore keeps the live values and ignores any in the file.
 */
const SECRET_SETTINGS = ["calendar_token", "google_client_id", "google_client_secret", "google_redirect_uri", "google_oauth_state", "google_login_state", "allowed_google_emails"];
const only = (table: string) => (table === "settings" ? ` WHERE key NOT IN (${SECRET_SETTINGS.map((k) => `'${k}'`).join(",")})` : "");
/** Tables added in backup version 5. An older file doesn't have them, so restoring one leaves them as they are. */
const LIFE_TABLES = ["habits", "habit_log", "projects", "milestones", "captures", "routine", "reviews", "schedule_blocks", "external_events"];
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
              p.status, p.confidence, p.last_revised AS lastRevised, p.practice_done AS practiceDone,
              COALESCE(p.notes, '') AS notes
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
    return { ...(s as { id: string; name: string; grp: string; priority: number }), examDates, chapters: own, progressPct: startedPct(scoped.map((ch) => (ch.passes as (string | null)[]).some(Boolean))) };
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

async function addChapterTargets(db: D1Database, picks: { chapterId: string; subjectId?: string; confidence?: number; title: string }[], t: string) {
  if (picks.length) {
    await db.batch(
      picks.map((p) =>
        db
          .prepare("INSERT INTO daily_targets (day, chapter_id, subject_id, title, duration) VALUES (?, ?, ?, ?, ?)")
          .bind(t, p.chapterId, p.subjectId ?? null, p.title, computeChapterDuration(p.confidence, p.subjectId)),
      ),
    );
  }
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
  const res = await db.batch([
    ...logs.map((l) =>
      db
        .prepare(
          "INSERT INTO sessions (subject_id, day, minutes) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM timer WHERE id = 1 AND mode = ? AND started_at IS ?)",
        )
        .bind(l.subjectId, l.day, l.minutes, before.mode, before.startedAt),
    ),
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

export function createApp(opts: { now?: () => number; fetchFn?: typeof fetch } = {}) {
  const app = new Hono<Env>();
  const now = () => opts.now?.() ?? Date.now();
  const today = () => todayIST(now());
  const fetchFn = opts.fetchFn ?? fetch;
  const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as T;

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "Unexpected server error." }, 500);
  });

  registerAuth(app, now, fetchFn);
  registerLife(app, today, () => new Date(now()).toISOString());

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

    const since90 = new Date(Date.parse(t + "T00:00:00Z") - 90 * DAY_MS).toISOString().slice(0, 10);
    const [deliverableRes, sessionRes, targetRes, checkinRes, heatRes, scheduleRes, calTokenRes, googleSyncRes, externalEventsRes] = await db.batch<Row>([
      db.prepare("SELECT id, name, subject, detail, phase_id AS phaseId, status, done_count AS doneCount, total_count AS totalCount, due, viva_prep AS vivaPrep, gcal_event_id AS gcalEventId FROM deliverables ORDER BY id"),
      db.prepare("SELECT day, subject_id AS subjectId, SUM(minutes) AS minutes FROM sessions WHERE day >= ? GROUP BY day, subject_id ORDER BY day").bind(since),
      db.prepare("SELECT t.id, t.title, t.chapter_id AS chapterId, COALESCE(t.subject_id, c.subject_id) AS subjectId, COALESCE(t.duration, '45m') AS duration, t.done FROM daily_targets t LEFT JOIN chapters c ON c.id = t.chapter_id WHERE t.day = ? ORDER BY t.id").bind(t),
      db.prepare("SELECT day, energy FROM checkins WHERE day >= ? ORDER BY day").bind(since14),
      db.prepare("SELECT day, SUM(minutes) AS minutes FROM sessions WHERE day >= ? GROUP BY day ORDER BY day").bind(since90),
      db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos, gcal_event_id AS gcalEventId, gcal_event_day AS gcalEventDay FROM schedule_blocks ORDER BY pos, start_time"),
      db.prepare("SELECT value FROM settings WHERE key = 'calendar_token'"),
      db.prepare("SELECT id, calendar_id AS calendarId, last_synced_at AS lastSyncedAt, sync_token AS syncToken, scope, two_way AS twoWay FROM google_sync WHERE id = 1"),
      db.prepare("SELECT id, summary, description, starts_at AS startsAt, ends_at AS endsAt, is_study_block AS isStudyBlock, updated_at AS updatedAt FROM external_events WHERE starts_at >= ? AND starts_at <= ? ORDER BY starts_at").bind(`${t}T00:00:00+05:30`, `${t}T23:59:59+05:30`),
    ]);

    let scheduleBlocks = scheduleRes.results as ScheduleBlock[];
    if (scheduleBlocks.length === 0) {
      await db.batch(
        DEFAULT_SCHEDULE_BLOCKS.map((b) =>
          db.prepare("INSERT INTO schedule_blocks (title, category, start_time, end_time, color, pos) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(b.title, b.category, b.startTime, b.endTime, b.color, b.pos)
        )
      );
      scheduleBlocks = (await db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos, gcal_event_id AS gcalEventId, gcal_event_day AS gcalEventDay FROM schedule_blocks ORDER BY pos, start_time").all<ScheduleBlock>()).results;
    }

    let calToken = calTokenRes.results[0]?.value as string | undefined;
    if (!calToken) {
      calToken = "study_cal_" + crypto.randomUUID().replace(/-/g, "");
      await db.prepare("INSERT INTO settings (key, value) VALUES ('calendar_token', ?) ON CONFLICT(key) DO NOTHING").bind(calToken).run();
    }

    const syncRow = googleSyncRes.results[0] as { calendarId?: string; lastSyncedAt?: string; syncToken?: string; scope?: string | null; twoWay?: number } | undefined;
    const rawEvents = (externalEventsRes.results || []) as any[];
    const externalEvents = rawEvents.map((e) => ({
      ...e,
      isStudyBlock: !!e.isStudyBlock,
    }));
    const scheduleConflicts = detectScheduleConflicts(scheduleBlocks, rawEvents as any, t);

    return c.json({
      today: t, phases: model.phases, activePhaseId: model.active?.id ?? null, autoPhase: model.autoPhase, subjects: model.subjects,
      deliverables: deliverableRes.results.map((r) => ({ ...r, vivaPrep: !!r.vivaPrep })), sessions: sessionRes.results, heat: heatRes.results,
      targets: targetRes.results.map((r) => ({ ...r, done: !!r.done, duration: r.duration ?? "45m" })),
      checkin: (checkinRes.results.find((r) => r.day === t)?.energy as Energy | undefined) ?? null,
      checkins: checkinRes.results,
      scheduleBlocks,
      calendarToken: calToken,
      googleSync: {
        connected: !!syncRow,
        calendarId: syncRow?.calendarId || "primary",
        lastSyncedAt: syncRow?.lastSyncedAt || null,
        syncToken: syncRow?.syncToken || null,
        needsReauth: !!syncRow && !hasCalendarScope(syncRow.scope),
        twoWay: syncRow ? !!syncRow.twoWay : true,
        calendarTarget: (syncRow?.calendarId || "primary") === "primary" ? "primary" : "deck",
      },
      externalEvents,
      scheduleConflicts,
      timer: timerView(timer, nowMs),
      ...(await lifeState(db, t)),
    });
  });

  app.post("/api/timer/start", async (c) => {
    const { subjectId, durationS } = await body<{ subjectId?: string; durationS?: number }>(c);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(subjectId ?? "").first())) return c.json({ error: "Pick a subject first." }, 404);
    const nowMs = now();
    const cur = await settleNow(db, nowMs);
    const validDuration = (typeof durationS === "number" && durationS >= 300 && durationS <= 7200) ? durationS : undefined;
    const next = startFocus(cur, subjectId!, nowMs, validDuration);
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
    const { title, chapterId, duration, subjectId } = await body<{ title?: string; chapterId?: string; duration?: string; subjectId?: string }>(c);
    const t = today();
    const db = c.env.DB;
    if (((await db.prepare("SELECT COUNT(*) AS n FROM daily_targets WHERE day = ?").bind(t).first<{ n: number }>())?.n ?? 0) >= MAX_TARGETS) return c.json({ error: `That's ${MAX_TARGETS} targets already. Finish or remove one first.` }, 400);
    let label = title?.trim() ?? "";
    let finalSubId = subjectId ?? null;
    let finalDuration = duration?.trim() || "";
    if (chapterId) {
      const row = await db.prepare("SELECT c.name AS chapter, s.name AS subject, s.id AS subId, p.confidence FROM chapters c JOIN subjects s ON s.id = c.subject_id JOIN progress p ON p.chapter_id = c.id WHERE c.id = ?").bind(chapterId).first<{ chapter: string; subject: string; subId: string; confidence: number }>();
      if (!row) return c.json({ error: "No such chapter." }, 404);
      if (!label) label = `${row.subject}: ${row.chapter}`;
      finalSubId = row.subId;
      if (!finalDuration) finalDuration = computeChapterDuration(row.confidence, row.subId);
    }
    if (!label) return c.json({ error: "Target needs a title." }, 400);
    if (!finalDuration) finalDuration = "45m";
    const r = await db.prepare("INSERT INTO daily_targets (day, chapter_id, subject_id, title, duration) VALUES (?, ?, ?, ?, ?)").bind(t, chapterId ?? null, finalSubId, label, finalDuration).run();
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
    await db.prepare("UPDATE daily_targets SET chapter_id = ?, subject_id = ?, title = ?, duration = ? WHERE id = ?").bind(pick.chapterId, pick.subjectId ?? null, pick.title, computeChapterDuration(pick.confidence, pick.subjectId), target.id).run();
    return c.json({ ok: true });
  });

  // Save an optional 1-line note for the most recent focus session
  app.post("/api/sessions/note", async (c) => {
    const { note } = await body<{ note?: string }>(c);
    const t = today();
    const cleanNote = typeof note === "string" ? note.trim().slice(0, 250) : "";
    if (!cleanNote) return c.json({ ok: true });
    const latest = await c.env.DB.prepare("SELECT id FROM sessions WHERE day = ? ORDER BY id DESC LIMIT 1").bind(t).first<{ id: number }>();
    if (latest) {
      await c.env.DB.prepare("UPDATE sessions SET note = ? WHERE id = ?").bind(cleanNote, latest.id).run();
    }
    return c.json({ ok: true });
  });

  // Attach a doubt or note to a chapter
  app.post("/api/chapters/:id/notes", async (c) => {
    const id = c.req.param("id");
    const { note } = await body<{ note?: string }>(c);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM chapters WHERE id = ?").bind(id).first())) {
      return c.json({ error: "No such chapter." }, 404);
    }
    const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : "";
    if (!cleanNote) return c.json({ ok: true });
    const cur = await db.prepare("SELECT notes FROM progress WHERE chapter_id = ?").bind(id).first<{ notes: string | null }>();
    const prev = cur?.notes ? cur.notes + "\n" : "";
    const updated = `${prev}• ${cleanNote}`;
    await db.prepare("UPDATE progress SET notes = ? WHERE chapter_id = ?").bind(updated, id).run();
    return c.json({ ok: true, notes: updated });
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
    // Status follows the revision passes (PUT .../passes/:n), so only confidence is set by hand.
    const { confidence } = await body<{ confidence?: number }>(c);
    if (!(Number.isInteger(confidence) && confidence! >= 1 && confidence! <= 5)) return c.json({ error: "Confidence must be 1 to 5." }, 400);
    const r = await c.env.DB.prepare("UPDATE progress SET confidence = ? WHERE chapter_id = ?").bind(confidence, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such chapter." }, 404);
  });

  app.patch("/api/chapters/:id/meta", async (c) => {
    const { name, scope } = await body<{ name?: string; scope?: string }>(c);
    if (name !== undefined && !name.trim()) return c.json({ error: "Chapter needs a name." }, 400);
    if (scope !== undefined && !validScope(scope)) return c.json({ error: "Scope must be unit1, unit2, pb1, pb2 or board." }, 400);
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
    // status follows the passes: none = not started, all three = mastered (leaves the study queue), otherwise learning.
    const syncStatus = db.prepare("UPDATE progress SET status = CASE (SELECT COUNT(*) FROM passes WHERE chapter_id = ?) WHEN 0 THEN 'not_started' WHEN ? THEN 'mastered' ELSE 'learning' END WHERE chapter_id = ?").bind(id, PASSES, id);
    if (done === false) {
      await db.batch([db.prepare("DELETE FROM passes WHERE chapter_id = ? AND pass_no = ?").bind(id, n), syncStatus]);
    } else {
      await db.batch([
        db.prepare("INSERT INTO passes (chapter_id, pass_no, done_at) VALUES (?, ?, ?) ON CONFLICT(chapter_id, pass_no) DO UPDATE SET done_at = excluded.done_at").bind(id, n, today()),
        db.prepare("UPDATE progress SET last_revised = ? WHERE chapter_id = ?").bind(today(), id),
        syncStatus,
      ]);
    }
    return c.json({ ok: true });
  });

  app.post("/api/chapters", async (c) => {
    const { subjectId, name, scope = "unit1" } = await body<{ subjectId?: string; name?: string; scope?: string }>(c);
    if (!name?.trim()) return c.json({ error: "Chapter needs a name." }, 400);
    if (!validScope(scope)) return c.json({ error: "Scope must be unit1, unit2, pb1, pb2 or board." }, 400);
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

  // Imports official CBSE Class 10 curriculum & rationalised NCERT chapters for one or all subjects.
  app.post("/api/syllabus/import-official", async (c) => {
    const { subjectId } = await body<{ subjectId?: string }>(c);
    const db = c.env.DB;
    const allSubjects = (await db.prepare("SELECT id FROM subjects").all<{ id: string }>()).results.map((r) => r.id);
    if (subjectId && subjectId !== "all" && !allSubjects.includes(subjectId)) {
      return c.json({ error: "No such subject." }, 404);
    }
    const targets = subjectId && subjectId !== "all" ? [subjectId] : allSubjects.filter((id) => id in OFFICIAL_CURRICULUM);
    let totalImported = 0;
    const statements: D1PreparedStatement[] = [];

    for (const subId of targets) {
      const official = OFFICIAL_CURRICULUM[subId];
      if (!official || !official.length) continue;
      const existing = (await db.prepare("SELECT id, name FROM chapters WHERE subject_id = ?").bind(subId).all<{ id: string; name: string }>()).results;
      const existingNames = new Map(existing.map((e) => [e.name.toLowerCase().trim(), e.id]));
      const max = await db.prepare("SELECT MAX(pos) AS m FROM chapters WHERE subject_id = ?").bind(subId).first<{ m: number | null }>();
      let nextPos = (max?.m ?? 0) + 1;

      for (const ch of official) {
        const cleanName = ch.name.toLowerCase().trim();
        const matchedId = [...existingNames.entries()].find(([name]) => name === cleanName || name.startsWith(cleanName) || cleanName.startsWith(name))?.[1];

        if (matchedId) {
          statements.push(
            db.prepare("UPDATE chapters SET confirmed = 1, source = ? WHERE id = ?").bind(ch.source, matchedId)
          );
        } else {
          const id = `${subId}-${crypto.randomUUID().slice(0, 8)}`;
          statements.push(
            db.prepare("INSERT INTO chapters (id, subject_id, name, pos, scope, confirmed, source) VALUES (?, ?, ?, ?, ?, 1, ?)")
              .bind(id, subId, ch.name, nextPos++, ch.scope, ch.source)
          );
          statements.push(db.prepare("INSERT INTO progress (chapter_id) VALUES (?)").bind(id));
          totalImported++;
        }
      }
    }

    const BATCH_SIZE = 80;
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await db.batch(statements.slice(i, i + BATCH_SIZE));
    }
    return c.json({ ok: true, imported: totalImported, subjects: targets.length });
  });

  // Deleting a chapter takes its revision passes and any daily targets with it.
  app.delete("/api/chapters/:id", async (c) => {
    const db = c.env.DB;
    const id = c.req.param("id");
    if (!(await db.prepare("SELECT 1 AS ok FROM chapters WHERE id = ?").bind(id).first())) return c.json({ error: "No such chapter." }, 404);
    await db.batch([
      db.prepare("DELETE FROM daily_targets WHERE chapter_id = ?").bind(id),
      db.prepare("DELETE FROM passes WHERE chapter_id = ?").bind(id),
      db.prepare("DELETE FROM progress WHERE chapter_id = ?").bind(id),
      db.prepare("DELETE FROM chapters WHERE id = ?").bind(id),
    ]);
    return c.json({ ok: true });
  });

  // New order for a subject's chapters: must list exactly its current chapters, once each.
  app.post("/api/subjects/:id/reorder", async (c) => {
    const { order } = await body<{ order?: unknown }>(c);
    const db = c.env.DB;
    const current = (await db.prepare("SELECT id FROM chapters WHERE subject_id = ?").bind(c.req.param("id")).all<{ id: string }>()).results.map((r) => r.id);
    if (!Array.isArray(order) || order.length !== current.length || new Set(order).size !== order.length || !order.every((id) => current.includes(id))) {
      return c.json({ error: "Order must list every chapter of this subject exactly once." }, 400);
    }
    await db.batch(order.map((id, i) => db.prepare("UPDATE chapters SET pos = ? WHERE id = ?").bind(i + 1, id)));
    return c.json({ ok: true });
  });

  // Marks a subject's whole chapter list as checked against the school PDF (or unchecks it).
  app.put("/api/subjects/:id/confirmed", async (c) => {
    const { confirmed = true } = await body<{ confirmed?: boolean }>(c);
    const db = c.env.DB;
    if (!(await db.prepare("SELECT 1 AS ok FROM subjects WHERE id = ?").bind(c.req.param("id")).first())) return c.json({ error: "No such subject." }, 404);
    await db.prepare("UPDATE chapters SET confirmed = ? WHERE subject_id = ?").bind(confirmed ? 1 : 0, c.req.param("id")).run();
    return c.json({ ok: true });
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

  app.post("/api/deliverables", async (c) => {
    const { name, subject, detail = "", phaseId = null, totalCount = null, due = null } =
      await body<{ name?: string; subject?: string; detail?: string; phaseId?: string | null; totalCount?: number | null; due?: string | null }>(c);
    if (!name?.trim()) return c.json({ error: "Deliverable needs a name." }, 400);
    if (!subject?.trim()) return c.json({ error: "Deliverable needs a subject." }, 400);
    if (due !== null && !validDate(due)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    if (totalCount !== null && !(Number.isInteger(totalCount) && totalCount >= 1 && totalCount <= 100)) return c.json({ error: "Total must be a whole number from 1 to 100." }, 400);
    const db = c.env.DB;
    if (phaseId !== null && !(await db.prepare("SELECT 1 AS ok FROM phases WHERE id = ?").bind(phaseId).first())) return c.json({ error: "No such phase." }, 404);
    const r = await db.prepare("INSERT INTO deliverables (name, subject, detail, phase_id, done_count, total_count, due) VALUES (?,?,?,?,?,?,?)")
      .bind(name.trim(), subject.trim(), detail.trim(), phaseId, totalCount === null ? null : 0, totalCount, due).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  // Changing the done count also moves the status (none = not started, all = done), unless a status is sent too.
  app.patch("/api/deliverables/:id", async (c) => {
    const b = await body<{ name?: string; subject?: string; detail?: string; due?: string | null; vivaPrep?: boolean; status?: string; doneCount?: number }>(c);
    const db = c.env.DB;
    const cur = await db.prepare("SELECT status, done_count AS doneCount, total_count AS totalCount FROM deliverables WHERE id = ?").bind(c.req.param("id")).first<{ status: string; doneCount: number | null; totalCount: number | null }>();
    if (!cur) return c.json({ error: "No such deliverable." }, 404);
    if (b.name !== undefined && !b.name.trim()) return c.json({ error: "Deliverable needs a name." }, 400);
    if (b.subject !== undefined && !b.subject.trim()) return c.json({ error: "Deliverable needs a subject." }, 400);
    if (b.due !== undefined && b.due !== null && !validDate(b.due)) return c.json({ error: "Use a date like 2026-11-24." }, 400);
    if (b.status !== undefined && !DELIVERABLE_STATUSES.includes(b.status)) return c.json({ error: "Status must be not_started, in_progress or done." }, 400);
    let status = b.status;
    if (b.doneCount !== undefined) {
      if (cur.totalCount === null) return c.json({ error: "This deliverable has no steps to count." }, 400);
      if (!(Number.isInteger(b.doneCount) && b.doneCount >= 0 && b.doneCount <= cur.totalCount)) return c.json({ error: `Done must be 0 to ${cur.totalCount}.` }, 400);
      status ??= b.doneCount === 0 ? "not_started" : b.doneCount === cur.totalCount ? "done" : "in_progress";
    }
    await db.prepare(
      `UPDATE deliverables SET name = COALESCE(?, name), subject = COALESCE(?, subject), detail = COALESCE(?, detail),
         due = CASE WHEN ? THEN ? ELSE due END, viva_prep = COALESCE(?, viva_prep), status = COALESCE(?, status), done_count = COALESCE(?, done_count)
       WHERE id = ?`,
    ).bind(b.name?.trim() ?? null, b.subject?.trim() ?? null, b.detail?.trim() ?? null, b.due === undefined ? 0 : 1, b.due ?? null,
      b.vivaPrep === undefined ? null : b.vivaPrep ? 1 : 0, status ?? null, b.doneCount ?? null, c.req.param("id")).run();
    return c.json({ ok: true });
  });

  app.delete("/api/deliverables/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM deliverables WHERE id = ?").bind(c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such deliverable." }, 404);
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

  // --- Dynamic ICS / iCal Feed ---
  app.get("/api/calendar/feed.ics", async (c) => {
    if (!c.env.SESSION_SECRET) {
      return c.text("Server auth isn't configured.", 500);
    }
    const token = c.req.query("token") ?? "";
    let authorized = false;

    // Only the dedicated random calendar token (or a session) opens the feed. A password must never be accepted
    // here: this endpoint has no lockout, so it would be an unthrottled password guessing oracle.
    if (token) {
      const calTokenRow = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'calendar_token'").first<{ value: string }>();
      authorized = !!calTokenRow?.value && (await same(token, calTokenRow.value));
    } else {
      authorized = await hasValidSession(c, Math.floor(now() / 1000));
    }

    if (!authorized) {
      return c.text("Unauthorized: Calendar token required. Please subscribe using your secure token URL.", 401);
    }

    const t = today();
    const nowMs = now();
    const db = c.env.DB;

    const [phaseRes, examRes, scheduleRes, deliverableRes, targetRes, externalEventsRes] = await db.batch<Row>([
      db.prepare("SELECT id, name, scope, starts_on AS startsOn, ends_on AS endsOn, confirmed FROM phases ORDER BY pos"),
      db.prepare("SELECT se.subject_id AS subjectId, se.phase_id AS phaseId, se.date, s.name AS subjectName, p.name AS phaseName FROM subject_exams se JOIN subjects s ON s.id = se.subject_id JOIN phases p ON p.id = se.phase_id ORDER BY se.date"),
      db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos FROM schedule_blocks ORDER BY pos, start_time"),
      db.prepare("SELECT id, name, subject, detail, due, status, viva_prep AS vivaPrep FROM deliverables WHERE due IS NOT NULL AND status != 'done' ORDER BY due"),
      db.prepare("SELECT id, day, title, done, duration FROM daily_targets WHERE day >= ? ORDER BY day, id").bind(t),
      db.prepare("SELECT summary, starts_at AS startsAt, ends_at AS endsAt FROM external_events WHERE starts_at >= ? AND is_study_block = 0 ORDER BY starts_at").bind(`${t}T00:00:00+05:30`),
    ]);

    const phases = phaseRes.results.map((p) => ({ ...p, confirmed: !!p.confirmed })) as any;
    const subjectExams = examRes.results as any;
    let scheduleBlocks = scheduleRes.results as ScheduleBlock[];
    if (scheduleBlocks.length === 0) {
      scheduleBlocks = DEFAULT_SCHEDULE_BLOCKS.map((b, i) => ({ ...b, id: i + 1 }));
    }
    const deliverables = deliverableRes.results.map((d) => ({ ...d, vivaPrep: !!d.vivaPrep })) as any;
    const dailyTargets = targetRes.results.map((tg) => ({ ...tg, done: !!tg.done })) as any;
    const externalEvents = (externalEventsRes.results || []) as any;

    const icsContent = generateIcsFeed({
      phases,
      subjectExams,
      scheduleBlocks,
      deliverables,
      dailyTargets,
      externalEvents,
      today: t,
      nowMs,
    });

    c.header("Content-Type", "text/calendar; charset=utf-8");
    c.header("Content-Disposition", 'inline; filename="study-calendar.ics"');
    c.header("Cache-Control", "private, max-age=300");
    return c.body(icsContent, 200);
  });

  // Calendar token endpoints
  app.get("/api/calendar/token", async (c) => {
    const db = c.env.DB;
    let token = (await db.prepare("SELECT value FROM settings WHERE key = 'calendar_token'").first<{ value: string }>())?.value;
    if (!token) {
      token = "study_cal_" + crypto.randomUUID().replace(/-/g, "");
      await db.prepare("INSERT INTO settings (key, value) VALUES ('calendar_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(token).run();
    }
    return c.json({ token, feedPath: `/api/calendar/feed.ics?token=${token}` });
  });

  app.post("/api/calendar/token/reset", async (c) => {
    const db = c.env.DB;
    const token = "study_cal_" + crypto.randomUUID().replace(/-/g, "");
    await db.prepare("INSERT INTO settings (key, value) VALUES ('calendar_token', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(token).run();
    return c.json({ token, feedPath: `/api/calendar/feed.ics?token=${token}` });
  });

  // --- Schedule Blocks & Time Shifting ---
  app.patch("/api/schedule/blocks/:id", async (c) => {
    const b = await body<{ title?: string; startTime?: string; endTime?: string; color?: string; category?: string; pos?: number }>(c);
    const db = c.env.DB;
    const id = c.req.param("id");
    const cur = await db.prepare("SELECT id FROM schedule_blocks WHERE id = ?").bind(id).first();
    if (!cur) return c.json({ error: "Schedule block not found." }, 404);

    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (b.startTime !== undefined && !timeRegex.test(b.startTime)) return c.json({ error: "Start time must be HH:MM format." }, 400);
    if (b.endTime !== undefined && !timeRegex.test(b.endTime)) return c.json({ error: "End time must be HH:MM format." }, 400);

    await db.prepare(
      `UPDATE schedule_blocks SET
         title = COALESCE(?, title),
         start_time = COALESCE(?, start_time),
         end_time = COALESCE(?, end_time),
         color = COALESCE(?, color),
         category = COALESCE(?, category),
         pos = COALESCE(?, pos)
       WHERE id = ?`
    ).bind(
      b.title?.trim() ?? null,
      b.startTime ?? null,
      b.endTime ?? null,
      b.color ?? null,
      b.category ?? null,
      b.pos ?? null,
      id
    ).run();

    return c.json({ ok: true });
  });

  app.post("/api/schedule/shift", async (c) => {
    const { deltaMins, fromId } = await body<{ deltaMins?: number; fromId?: number }>(c);
    if (typeof deltaMins !== "number" || deltaMins < -180 || deltaMins > 180 || deltaMins === 0) {
      return c.json({ error: "deltaMins must be between -180 and 180 and non-zero." }, 400);
    }
    const db = c.env.DB;
    const rows = (await db.prepare("SELECT id, start_time AS startTime, end_time AS endTime, pos FROM schedule_blocks ORDER BY pos, start_time").all<{ id: number; startTime: string; endTime: string; pos: number }>()).results;
    if (rows.length === 0) return c.json({ ok: true });

    let shouldShift = fromId === undefined;
    const updates: { id: number; startTime: string; endTime: string }[] = [];

    for (const r of rows) {
      if (!shouldShift && r.id === fromId) shouldShift = true;
      if (shouldShift) {
        updates.push({
          id: r.id,
          startTime: shiftTimeStr(r.startTime, deltaMins),
          endTime: shiftTimeStr(r.endTime, deltaMins),
        });
      }
    }

    if (updates.length > 0) {
      await db.batch(
        updates.map((u) =>
          db.prepare("UPDATE schedule_blocks SET start_time = ?, end_time = ? WHERE id = ?")
            .bind(u.startTime, u.endTime, u.id)
        )
      );
    }

    return c.json({ ok: true, shifted: updates.length });
  });

  app.post("/api/schedule/reset", async (c) => {
    const db = c.env.DB;
    await db.batch([
      db.prepare("DELETE FROM schedule_blocks"),
      ...DEFAULT_SCHEDULE_BLOCKS.map((b) =>
        db.prepare("INSERT INTO schedule_blocks (title, category, start_time, end_time, color, pos) VALUES (?, ?, ?, ?, ?, ?)")
          .bind(b.title, b.category, b.startTime, b.endTime, b.color, b.pos)
      ),
    ]);
    return c.json({ ok: true });
  });

  // --- Google Calendar API v3 Two-Way Live Sync Endpoints ---
  app.get("/api/google/status", async (c) => {
    const db = c.env.DB;
    const [syncRow, eventCountRes] = await db.batch<Row>([
      db.prepare("SELECT id, calendar_id AS calendarId, last_synced_at AS lastSyncedAt, sync_token AS syncToken, scope, two_way AS twoWay FROM google_sync WHERE id = 1"),
      db.prepare("SELECT COUNT(*) AS count FROM external_events"),
    ]);
    const sync = syncRow.results[0] as { calendarId?: string; lastSyncedAt?: string; syncToken?: string; scope?: string | null; twoWay?: number } | undefined;
    const creds = await getGoogleCredentials(db, c.env, new URL(c.req.url).origin);
    const count = (eventCountRes.results[0]?.count as number) ?? 0;
    return c.json({
      connected: !!sync,
      hasCredentials: !!creds,
      calendarId: sync?.calendarId || "primary",
      lastSyncedAt: sync?.lastSyncedAt || null,
      syncToken: sync?.syncToken || null,
      needsReauth: !!sync && !hasCalendarScope(sync.scope),
      twoWay: sync ? !!sync.twoWay : true,
      calendarTarget: (sync?.calendarId || "primary") === "primary" ? "primary" : "deck",
      eventCount: count,
      clientIdPreview: creds ? `${creds.clientId.slice(0, 8)}...` : null,
    });
  });

  app.get("/api/google/auth/url", async (c) => {
    const db = c.env.DB;
    const origin = new URL(c.req.url).origin;
    const creds = await getGoogleCredentials(db, c.env, origin);
    if (!creds) {
      return c.json({
        error: "Google Client ID and Secret are not configured yet. Configure them in environment secrets or the Setup tab.",
      }, 400);
    }
    const secret = c.env.SESSION_SECRET;
    if (!secret) return c.json({ error: "Server auth isn't configured." }, 500);
    const stateToken = crypto.randomUUID();
    // Bind the state to this browser with a short-lived signed Lax cookie (Lax so it survives Google's redirect back).
    await setSignedCookie(c, "gcal_state", stateToken, secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Lax",
      path: "/",
      maxAge: 600,
    });
    // Localhost-only fallback for the HTTPS -> HTTP cookie drop (see isLocalDev).
    if (isLocalDev(c.req.url)) {
      await db.prepare("INSERT INTO settings (key, value) VALUES ('google_oauth_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(`${stateToken}:${Math.floor(now() / 1000) + 600}`).run();
    }
    const url = buildGoogleAuthUrl(creds, stateToken);
    return c.json({ url });
  });

  app.get("/api/google/callback", async (c) => {
    const db = c.env.DB;
    const code = c.req.query("code");
    const state = c.req.query("state");
    const error = c.req.query("error");

    if (error) {
      return c.redirect(`/#schedule?sync_error=${encodeURIComponent(error)}`);
    }
    if (!code) {
      return c.redirect("/#schedule?sync_error=missing_code");
    }

    // State must match the signed cookie from this browser; single-use, so both copies are cleared up front.
    const secret = c.env.SESSION_SECRET;
    const cookieState = secret ? await getSignedCookie(c, secret, "gcal_state") : undefined;
    deleteCookie(c, "gcal_state", { path: "/" });
    let stateValid = !!state && !!cookieState && (await same(state, cookieState));
    if (isLocalDev(c.req.url)) {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'google_oauth_state'").first<{ value: string }>();
      await db.prepare("DELETE FROM settings WHERE key = 'google_oauth_state'").run();
      const [savedNonce, expiry] = (row?.value ?? "").split(":");
      if (!stateValid && state && savedNonce && Number(expiry) >= Math.floor(now() / 1000) && (await same(state, savedNonce))) stateValid = true;
    }
    if (!stateValid) {
      return c.redirect("/#schedule?sync_error=state_mismatch");
    }

    const origin = new URL(c.req.url).origin;
    const creds = await getGoogleCredentials(db, c.env, origin);
    if (!creds) {
      return c.redirect("/#schedule?sync_error=missing_credentials");
    }

    try {
      const tokens = await exchangeGoogleAuthCode(code, creds);
      const expiresAt = now() + tokens.expiresIn * 1000;

      await db.prepare(
        `INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id, last_synced_at, sync_token, scope)
         VALUES (1, ?, ?, ?, 'primary', NULL, NULL, ?)
         ON CONFLICT(id) DO UPDATE SET
           refresh_token = excluded.refresh_token,
           access_token = excluded.access_token,
           expires_at = excluded.expires_at,
           scope = excluded.scope`
      ).bind(tokens.refreshToken, tokens.accessToken, expiresAt, tokens.scope).run();

      // Immediately pull recent events
      await pullGoogleEvents(db, c.env, now()).catch(() => null);

      return c.redirect("/#schedule?sync=connected");
    } catch (err: any) {
      return c.redirect(`/#schedule?sync_error=${encodeURIComponent(err?.message || "oauth_failed")}`);
    }
  });

  app.post("/api/google/setup", async (c) => {
    const { clientId, clientSecret, redirectUri, refreshToken, calendarId } = await body<{
      clientId?: string;
      clientSecret?: string;
      redirectUri?: string;
      refreshToken?: string;
      calendarId?: string;
    }>(c);
    const db = c.env.DB;

    const stmts: D1PreparedStatement[] = [];
    if (clientId?.trim()) {
      stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(clientId.trim()));
    }
    if (clientSecret?.trim()) {
      stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(clientSecret.trim()));
    }
    if (redirectUri?.trim()) {
      stmts.push(db.prepare("INSERT INTO settings (key, value) VALUES ('google_redirect_uri', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(redirectUri.trim()));
    }
    if (refreshToken?.trim()) {
      stmts.push(
        db.prepare(
          `INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id, last_synced_at, sync_token)
           VALUES (1, ?, NULL, 0, ?, NULL, NULL)
           ON CONFLICT(id) DO UPDATE SET
             refresh_token = excluded.refresh_token,
             calendar_id = excluded.calendar_id`
        ).bind(refreshToken.trim(), calendarId?.trim() || "primary")
      );
    }
    if (stmts.length > 0) {
      await db.batch(stmts);
    }

    let syncedCount = 0;
    if (refreshToken?.trim()) {
      try {
        const pullRes = await pullGoogleEvents(db, c.env, now());
        syncedCount = pullRes.syncedCount;
      } catch (err: any) {
        return c.json({ ok: true, warning: `Credentials saved, but initial sync had an issue: ${err?.message}` });
      }
    }

    return c.json({ ok: true, syncedCount });
  });

  /** Credential or scope failures answer 403 with reauth (401 is the app session, which signs the user out), so the UI can offer the consent screen instead of a dead end. */
  const googleFail = (c: Context, err: unknown, fallback: string) =>
    isAuthFailure(err)
      ? c.json({ error: err instanceof Error ? err.message : fallback, reauth: true }, 403)
      : c.json({ error: (err instanceof Error && err.message) || fallback }, 400);

  app.post("/api/google/sync", async (c) => {
    const db = c.env.DB;
    try {
      const mode = await db.prepare("SELECT two_way AS twoWay FROM google_sync WHERE id = 1").first<{ twoWay: number }>();
      if (mode && !mode.twoWay) return c.json({ ok: true, skipped: true });
      const res = await pullGoogleEvents(db, c.env, now());
      return c.json({ ok: true, ...res });
    } catch (err) {
      return googleFail(c, err, "Sync failed");
    }
  });

  type TrackedBlock = ScheduleBlock & { gcalEventId?: string | null; gcalEventDay?: string | null };
  /** Pushes a block for one day: updates the event it already became that day, otherwise creates one and remembers it. */
  const pushBlockTracked = async (c: Context<Env>, block: TrackedBlock, date: string) => {
    const db = c.env.DB;
    if (block.gcalEventId && block.gcalEventDay === date) {
      try {
        await updateCalendarEvent(db, c.env, block.gcalEventId, { title: `[Command Deck] ${block.title}`, start: `${date}T${block.startTime}:00+05:30`, end: `${date}T${block.endTime}:00+05:30` }, now());
        return block.gcalEventId;
      } catch (err) {
        if (!/\((404|410)\)/.test(err instanceof Error ? err.message : "")) throw err; // deleted in Google: fall through and create it again
      }
    }
    const res = await pushBlockToGoogle(db, c.env, block, date, now());
    await db.prepare("UPDATE schedule_blocks SET gcal_event_id = ?, gcal_event_day = ? WHERE id = ?").bind(res.eventId, date, block.id).run();
    return res.eventId;
  };

  app.post("/api/google/push", async (c) => {
    const { blockId, date } = await body<{ blockId?: number; date?: string }>(c);
    const db = c.env.DB;
    const targetDate = date || today();

    try {
      if (blockId) {
        const block = await db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos, gcal_event_id AS gcalEventId, gcal_event_day AS gcalEventDay FROM schedule_blocks WHERE id = ?").bind(blockId).first<TrackedBlock>();
        if (!block) return c.json({ error: "Schedule block not found." }, 404);
        return c.json({ ok: true, pushed: 1, eventId: await pushBlockTracked(c, block, targetDate) });
      }

      const blocks = (await db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos, gcal_event_id AS gcalEventId, gcal_event_day AS gcalEventDay FROM schedule_blocks ORDER BY pos, start_time").all<TrackedBlock>()).results;
      const eventIds: string[] = [];
      for (const b of blocks) eventIds.push(await pushBlockTracked(c, b, targetDate));
      return c.json({ ok: true, pushed: eventIds.length, eventIds });
    } catch (err) {
      return googleFail(c, err, "Push failed");
    }
  });

  app.post("/api/google/disconnect", async (c) => {
    const db = c.env.DB;
    await db.batch([
      db.prepare("DELETE FROM google_sync WHERE id = 1"),
      db.prepare("DELETE FROM external_events"),
      db.prepare("UPDATE deliverables SET gcal_event_id = NULL"),
      db.prepare("UPDATE schedule_blocks SET gcal_event_id = NULL, gcal_event_day = NULL"),
    ]);
    return c.json({ ok: true });
  });

  app.get("/api/google/events", async (c) => {
    const db = c.env.DB;
    const targetDate = c.req.query("date") || today();
    const rows = (await db.prepare(
      "SELECT id, summary, description, starts_at AS startsAt, ends_at AS endsAt, is_study_block AS isStudyBlock, updated_at AS updatedAt FROM external_events WHERE starts_at >= ? AND starts_at <= ? ORDER BY starts_at"
    ).bind(`${targetDate}T00:00:00+05:30`, `${targetDate}T23:59:59+05:30`).all<ExternalEvent>()).results;

    const blocks = (await db.prepare("SELECT id, title, category, start_time AS startTime, end_time AS endTime, color, pos FROM schedule_blocks ORDER BY pos, start_time").all<ScheduleBlock>()).results;
    const conflicts = detectScheduleConflicts(blocks, rows, targetDate);

    return c.json({
      date: targetDate,
      events: rows.map((r) => ({ ...r, isStudyBlock: !!r.isStudyBlock })),
      conflicts,
    });
  });

  app.delete("/api/google/events/:id", async (c) => {
    const id = c.req.param("id");
    const db = c.env.DB;
    try {
      await deleteGoogleCalendarEvent(db, c.env, id, now());
      return c.json({ ok: true });
    } catch (err) {
      return googleFail(c, err, "Delete failed");
    }
  });

  // --- Live calendar API: read, create, reschedule and cancel events on the selected Google calendar ---
  const DAY_MS = 86_400_000;
  const parseEvent = (b: Row, partial: boolean): { input: CalendarEventInput } | { error: string } => {
    const input: CalendarEventInput = {};
    if (b.title !== undefined) {
      if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200) return { error: "Title must be 1 to 200 characters." };
      input.title = b.title.trim();
    }
    if (b.description !== undefined) {
      if (typeof b.description !== "string" || b.description.length > 2000) return { error: "Description must be text up to 2000 characters." };
      input.description = b.description;
    }
    for (const k of ["start", "end"] as const) {
      if (b[k] === undefined) continue;
      if (typeof b[k] !== "string" || Number.isNaN(Date.parse(b[k]))) return { error: `${k} must be an ISO date-time.` };
      input[k] = b[k];
    }
    if (b.reminderMinutes !== undefined) {
      if (!Number.isInteger(b.reminderMinutes) || b.reminderMinutes < 0 || b.reminderMinutes > 40_320) return { error: "reminderMinutes must be a whole number from 0 to 40320." };
      input.reminderMinutes = b.reminderMinutes;
    }
    if (input.start && input.end && Date.parse(input.end) <= Date.parse(input.start)) return { error: "end must be after start." };
    if (!partial && (!input.title || !input.start || !input.end)) return { error: "title, start and end are required." };
    if (partial && Object.keys(input).length === 0) return { error: "Nothing to update." };
    return { input };
  };

  const unlinkEvent = (db: D1Database, eventId: string) =>
    db.batch([
      db.prepare("UPDATE deliverables SET gcal_event_id = NULL WHERE gcal_event_id = ?").bind(eventId),
      db.prepare("UPDATE schedule_blocks SET gcal_event_id = NULL, gcal_event_day = NULL WHERE gcal_event_id = ?").bind(eventId),
    ]);

  app.get("/api/calendar/events", async (c) => {
    const days = c.req.query("range") === "month" ? 31 : 7;
    const from = Date.parse(`${today()}T00:00:00+05:30`);
    try {
      return c.json({ range: days === 7 ? "week" : "month", events: await listCalendarEvents(c.env.DB, c.env, from, from + days * DAY_MS, now()) });
    } catch (err) {
      return googleFail(c, err, "Could not read the calendar");
    }
  });

  app.post("/api/calendar/events", async (c) => {
    const b = await body<Row>(c);
    const parsed = parseEvent(b, false);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    const db = c.env.DB;
    // deliverableId links the new event to that deliverable, so it can be updated later instead of duplicated.
    const deliverableId = Number.isInteger(b.deliverableId) ? (b.deliverableId as number) : null;
    try {
      if (deliverableId !== null) {
        const row = await db.prepare("SELECT gcal_event_id AS eventId FROM deliverables WHERE id = ?").bind(deliverableId).first<{ eventId: string | null }>();
        if (!row) return c.json({ error: "Deliverable not found." }, 404);
        if (row.eventId) {
          try {
            await updateCalendarEvent(db, c.env, row.eventId, parsed.input, now());
            return c.json({ ok: true, id: row.eventId, updated: true });
          } catch (err) {
            if (!/\((404|410)\)/.test(err instanceof Error ? err.message : "")) throw err; // deleted in Google: create it again below
          }
        }
      }
      const created = await createCalendarEvent(db, c.env, parsed.input as Required<Pick<CalendarEventInput, "title" | "start" | "end">>, now());
      if (deliverableId !== null) await db.prepare("UPDATE deliverables SET gcal_event_id = ? WHERE id = ?").bind(created.id, deliverableId).run();
      return c.json({ ok: true, id: created.id, htmlLink: created.htmlLink ?? null });
    } catch (err) {
      return googleFail(c, err, "Could not create the event");
    }
  });

  app.patch("/api/calendar/events/:id", async (c) => {
    const parsed = parseEvent(await body<Row>(c), true);
    if ("error" in parsed) return c.json({ error: parsed.error }, 400);
    const id = c.req.param("id");
    try {
      await updateCalendarEvent(c.env.DB, c.env, id, parsed.input, now());
      return c.json({ ok: true });
    } catch (err) {
      if (/\((404|410)\)/.test(err instanceof Error ? err.message : "")) {
        // The event was removed in Google itself: forget the link so the next push creates it fresh.
        await unlinkEvent(c.env.DB, id);
        return c.json({ error: "That event no longer exists in Google Calendar. Push it again to recreate it." }, 404);
      }
      return googleFail(c, err, "Could not update the event");
    }
  });

  app.delete("/api/calendar/events/:id", async (c) => {
    try {
      await removeCalendarEvent(c.env.DB, c.env, c.req.param("id"), now());
      await unlinkEvent(c.env.DB, c.req.param("id"));
      return c.json({ ok: true });
    } catch (err) {
      return googleFail(c, err, "Could not delete the event");
    }
  });

  app.post("/api/calendar/target", async (c) => {
    const { target } = await body<{ target?: string }>(c);
    if (target !== "primary" && target !== "deck") return c.json({ error: "target must be primary or deck." }, 400);
    try {
      await selectCalendar(c.env.DB, c.env, target, now());
      return c.json({ ok: true, calendarTarget: target });
    } catch (err) {
      return googleFail(c, err, "Could not switch calendars");
    }
  });

  app.put("/api/calendar/settings", async (c) => {
    const { twoWay } = await body<{ twoWay?: unknown }>(c);
    if (typeof twoWay !== "boolean") return c.json({ error: "twoWay must be true or false." }, 400);
    const res = await c.env.DB.prepare("UPDATE google_sync SET two_way = ? WHERE id = 1").bind(twoWay ? 1 : 0).run();
    if (!res.meta.changes) return c.json({ error: "Google Calendar is not connected." }, 404);
    return c.json({ ok: true, twoWay });
  });

  // Whole-database export, so a wiped database or a move to another host never loses progress.
  app.get("/api/export", async (c) => {
    const db = c.env.DB;
    const names = Object.keys(TABLES);
    const res = await db.batch<Row>(names.map((t) => db.prepare(`SELECT * FROM ${t}${only(t)}`)));
    return c.json({ version: 5, ...Object.fromEntries(names.map((t, i) => [t, res[i].results])) });
  });

  // Restore replaces everything in one atomic batch. A bad file is rejected before the write, or
  // rolls back during it, so the existing data is never left half-replaced. Version 1 files (before
  // phases and scope tags) are upgraded on the way in.
  app.post("/api/import", async (c) => {
    let b = await body<Row>(c);
    const fail = (msg: string) => c.json({ error: msg }, 400);
    const db = c.env.DB;
    if (![1, 2, 3, 4, 5].includes(b.version)) return fail("This isn't a Command Deck backup (wrong or missing version).");
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
    // Before version 4: "term1" became unit1, and tasks became deliverables. The current deliverables are kept
    // (an old file never had the school submissions list), with the file's own tasks added after them.
    if (b.version < 4) {
      if (!Array.isArray(b.tasks) || !Array.isArray(b.subjects) || !Array.isArray(b.chapters)) return fail("Backup is missing the tasks, subjects or chapters list.");
      const current = (await db.prepare("SELECT id, name, subject, detail, phase_id, status, done_count, total_count, due, viva_prep FROM deliverables ORDER BY id").all<Row>()).results;
      let nextId = current.reduce((m, r) => Math.max(m, r.id), 0);
      const subjectName = (id: string | null) => b.subjects.find((s: Row) => s.id === id)?.name ?? "General";
      b.deliverables = [
        ...current,
        ...b.tasks.map((t: Row) => ({
          id: ++nextId, name: t.title, subject: subjectName(t.subject_id), detail: t.kind, phase_id: null,
          status: t.done ? "done" : "not_started", done_count: null, total_count: null, due: t.due, viva_prep: 0,
        })),
      ];
      delete b.tasks;
      b.chapters = b.chapters.map((ch: Row) => (ch.scope === "term1" ? { ...ch, scope: "unit1" } : ch));
    }
    b.schedule_blocks ??= [];
    const tables = Object.entries(TABLES).filter(([t]) => b.version >= 5 || !LIFE_TABLES.includes(t));
    for (const [table, cols] of tables) {
      if (!Array.isArray(b[table])) return fail(`Backup is missing the ${table} list.`);
      for (const row of b[table]) {
        if (!row || typeof row !== "object") return fail(`Backup has a bad row in ${table}.`);
        for (const col of cols) {
          if (!(col in row) || !(row[col] === null || ["string", "number"].includes(typeof row[col]))) return fail(`Backup has a bad "${col}" value in ${table}.`);
        }
        for (const col of Object.keys(OPTIONAL_COLS[table] ?? {})) {
          if (col in row && !(row[col] === null || ["string", "number"].includes(typeof row[col]))) return fail(`Backup has a bad "${col}" value in ${table}.`);
        }
      }
    }
    if (b.progress.some((p: Row) => !STATUSES.includes(p.status) || !Number.isInteger(p.confidence) || p.confidence < 1 || p.confidence > 5)) {
      return fail("Backup has an invalid status or confidence.");
    }
    if (b.chapters.some((ch: Row) => !validScope(ch.scope)) || b.phases.some((p: Row) => !validScope(p.scope))) return fail("Backup has an invalid scope.");
    if (b.deliverables.some((d: Row) => !DELIVERABLE_STATUSES.includes(d.status))) return fail("Backup has an invalid deliverable status.");
    const deletes = tables.map(([t]) => t).reverse().map((t) => db.prepare(`DELETE FROM ${t}${only(t)}`));
    const inserts = tables.flatMap(([t, required]) => {
      const optional = OPTIONAL_COLS[t] ?? {};
      const cols = [...required, ...Object.keys(optional)];
      const sql = `INSERT INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`;
      return (b[t] as Row[]).filter((row) => t !== "settings" || !SECRET_SETTINGS.includes(row.key)).map((row) => db.prepare(sql).bind(...cols.map((col) => (col in optional && !(col in row) ? optional[col] : row[col]))));
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
