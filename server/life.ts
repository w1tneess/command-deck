import type { Hono } from "hono";
import type { Env } from "./auth.ts";

type Row = Record<string, any>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: unknown): d is string => typeof d === "string" && ISO.test(d) && !Number.isNaN(Date.parse(d));
const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY_MS).toISOString().slice(0, 10);
const HABIT_LOOKBACK = 30; // a missed day can be filled in for this long

/** Monday of the week that holds `day` (weeks run Monday to Sunday). */
export const weekStart = (day: string) => addDays(day, -((new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7));

/** Days in a row that were done, ending today, or yesterday while today is still open. */
export function streak(done: Set<string>, today: string) {
  let n = 0;
  for (let d = done.has(today) ? today : addDays(today, -1); done.has(d); d = addDays(d, -1)) n++;
  return n;
}

/** Everything the life screens need, in one round trip. */
export async function lifeState(db: D1Database, today: string) {
  const since = addDays(today, -119);
  const since14 = addDays(today, -13);
  const [habitRes, logRes, captureRes, projectRes, milestoneRes, routineRes, reviewRes] = await db.batch<Row>([
    db.prepare("SELECT id, name, kind, goal FROM habits ORDER BY pos, id"),
    db.prepare("SELECT habit_id AS habitId, day, value FROM habit_log WHERE day >= ?").bind(since),
    db.prepare("SELECT id, text, kind, done, created_at AS createdAt FROM captures ORDER BY id DESC LIMIT 200"),
    db.prepare("SELECT id, name, detail FROM projects ORDER BY pos, id"),
    db.prepare("SELECT id, project_id AS projectId, title, done FROM milestones ORDER BY pos, id"),
    db.prepare("SELECT day, sleep, kickoff_at AS kickoffAt, wins, tomorrow, shutdown_at AS shutdownAt FROM routine WHERE day >= ? ORDER BY day").bind(since14),
    db.prepare("SELECT note FROM reviews WHERE week_start = ?").bind(weekStart(today)),
  ]);
  const doneDays = new Map<number, Set<string>>();
  const todayValue = new Map<number, number>();
  for (const h of habitRes.results) doneDays.set(h.id, new Set());
  const goals = new Map(habitRes.results.map((h) => [h.id as number, h.goal as number]));
  const perDay = new Map<string, number>();
  for (const l of logRes.results) {
    if (l.day === today) todayValue.set(l.habitId, l.value);
    if (l.value < (goals.get(l.habitId) ?? Infinity)) continue; // logged, but short of the daily goal
    doneDays.get(l.habitId)?.add(l.day);
    perDay.set(l.day, (perDay.get(l.day) ?? 0) + 1);
  }
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return {
    habits: habitRes.results.map((h) => ({
      ...h, today: todayValue.get(h.id) ?? 0, streak: streak(doneDays.get(h.id)!, today), last7: last7.map((d) => doneDays.get(h.id)!.has(d)),
    })),
    habitDays: [...perDay].map(([day, done]) => ({ day, done })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    captures: captureRes.results.map((c) => ({ ...c, done: !!c.done })),
    projects: projectRes.results.map((p) => ({ ...p, milestones: milestoneRes.results.filter((m) => m.projectId === p.id).map((m) => ({ ...m, done: !!m.done })) })),
    routine: routineRes.results.find((r) => r.day === today) ?? { day: today, sleep: null, kickoffAt: null, wins: "", tomorrow: "", shutdownAt: null },
    routines: routineRes.results.map((r) => ({ day: r.day, sleep: r.sleep })),
    review: { weekStart: weekStart(today), note: (reviewRes.results[0]?.note as string | undefined) ?? "" },
  };
}

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim().length >= 1 && v.trim().length <= max ? v.trim() : null);

export function registerLife(app: Hono<Env>, today: () => string, nowIso: () => string) {
  const body = async <T>(c: { req: { json: () => Promise<unknown> } }) => ((await c.req.json().catch(() => ({}))) ?? {}) as T;
  const one = async (db: D1Database, sql: string, id: string | number) => !!(await db.prepare(sql).bind(id).first());

  // Habits
  app.post("/api/habits", async (c) => {
    const { name, kind = "tick", goal = 1 } = await body<{ name?: unknown; kind?: string; goal?: number }>(c);
    const n = text(name, 60);
    if (!n) return c.json({ error: "Habit needs a name (up to 60 characters)." }, 400);
    if (kind !== "tick" && kind !== "count") return c.json({ error: "Kind must be tick or count." }, 400);
    if (!Number.isInteger(goal) || goal < 1 || goal > 50) return c.json({ error: "Goal must be a whole number from 1 to 50." }, 400);
    const max = await c.env.DB.prepare("SELECT MAX(pos) AS m FROM habits").first<{ m: number | null }>();
    const r = await c.env.DB.prepare("INSERT INTO habits (name, kind, goal, pos) VALUES (?,?,?,?)").bind(n, kind, kind === "tick" ? 1 : goal, (max?.m ?? 0) + 1).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/habits/:id", async (c) => {
    const { name, goal } = await body<{ name?: unknown; goal?: number }>(c);
    if (name !== undefined && !text(name, 60)) return c.json({ error: "Habit needs a name (up to 60 characters)." }, 400);
    if (goal !== undefined && !(Number.isInteger(goal) && goal >= 1 && goal <= 50)) return c.json({ error: "Goal must be a whole number from 1 to 50." }, 400);
    const r = await c.env.DB.prepare("UPDATE habits SET name = COALESCE(?, name), goal = CASE WHEN kind = 'count' THEN COALESCE(?, goal) ELSE goal END WHERE id = ?")
      .bind(name === undefined ? null : text(name, 60), goal ?? null, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such habit." }, 404);
  });

  app.delete("/api/habits/:id", async (c) => {
    const id = c.req.param("id");
    if (!(await one(c.env.DB, "SELECT 1 FROM habits WHERE id = ?", id))) return c.json({ error: "No such habit." }, 404);
    await c.env.DB.batch([c.env.DB.prepare("DELETE FROM habit_log WHERE habit_id = ?").bind(id), c.env.DB.prepare("DELETE FROM habits WHERE id = ?").bind(id)]);
    return c.json({ ok: true });
  });

  // Sets the value for a day (default today). 0 clears it. Past days can be filled in for a month.
  app.put("/api/habits/:id/log", async (c) => {
    const { value, day = today() } = await body<{ value?: number; day?: string }>(c);
    const t = today();
    if (!Number.isInteger(value) || value! < 0 || value! > 99) return c.json({ error: "Value must be a whole number from 0 to 99." }, 400);
    if (!validDate(day) || day > t || day < addDays(t, -HABIT_LOOKBACK)) return c.json({ error: `Pick a day from the last ${HABIT_LOOKBACK} days.` }, 400);
    const id = c.req.param("id");
    if (!(await one(c.env.DB, "SELECT 1 FROM habits WHERE id = ?", id))) return c.json({ error: "No such habit." }, 404);
    await (value === 0
      ? c.env.DB.prepare("DELETE FROM habit_log WHERE habit_id = ? AND day = ?").bind(id, day)
      : c.env.DB.prepare("INSERT INTO habit_log (habit_id, day, value) VALUES (?,?,?) ON CONFLICT(habit_id, day) DO UPDATE SET value = excluded.value").bind(id, day, value)).run();
    return c.json({ ok: true });
  });

  // Quick capture
  app.post("/api/captures", async (c) => {
    const { text: raw, kind = "note" } = await body<{ text?: unknown; kind?: string }>(c);
    const t = text(raw, 500);
    if (!t) return c.json({ error: "Write something first (up to 500 characters)." }, 400);
    if (kind !== "note" && kind !== "todo") return c.json({ error: "Kind must be note or todo." }, 400);
    const r = await c.env.DB.prepare("INSERT INTO captures (text, kind, created_at) VALUES (?,?,?)").bind(t, kind, nowIso()).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/captures/:id", async (c) => {
    const { text: raw, kind, done } = await body<{ text?: unknown; kind?: string; done?: boolean }>(c);
    if (raw !== undefined && !text(raw, 500)) return c.json({ error: "Write something first (up to 500 characters)." }, 400);
    if (kind !== undefined && kind !== "note" && kind !== "todo") return c.json({ error: "Kind must be note or todo." }, 400);
    const r = await c.env.DB.prepare("UPDATE captures SET text = COALESCE(?, text), kind = COALESCE(?, kind), done = COALESCE(?, done) WHERE id = ?")
      .bind(raw === undefined ? null : text(raw, 500), kind ?? null, done === undefined ? null : done ? 1 : 0, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such capture." }, 404);
  });

  app.delete("/api/captures/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM captures WHERE id = ?").bind(c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such capture." }, 404);
  });

  // Projects and their milestones
  app.post("/api/projects", async (c) => {
    const { name, detail = "" } = await body<{ name?: unknown; detail?: unknown }>(c);
    const n = text(name, 80);
    if (!n) return c.json({ error: "Project needs a name (up to 80 characters)." }, 400);
    if (typeof detail !== "string" || detail.length > 500) return c.json({ error: "Detail can be up to 500 characters." }, 400);
    const max = await c.env.DB.prepare("SELECT MAX(pos) AS m FROM projects").first<{ m: number | null }>();
    const r = await c.env.DB.prepare("INSERT INTO projects (name, detail, pos) VALUES (?,?,?)").bind(n, detail.trim(), (max?.m ?? 0) + 1).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/projects/:id", async (c) => {
    const { name, detail } = await body<{ name?: unknown; detail?: unknown }>(c);
    if (name !== undefined && !text(name, 80)) return c.json({ error: "Project needs a name (up to 80 characters)." }, 400);
    if (detail !== undefined && (typeof detail !== "string" || detail.length > 500)) return c.json({ error: "Detail can be up to 500 characters." }, 400);
    const r = await c.env.DB.prepare("UPDATE projects SET name = COALESCE(?, name), detail = COALESCE(?, detail) WHERE id = ?")
      .bind(name === undefined ? null : text(name, 80), detail === undefined ? null : (detail as string).trim(), c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such project." }, 404);
  });

  app.delete("/api/projects/:id", async (c) => {
    const id = c.req.param("id");
    if (!(await one(c.env.DB, "SELECT 1 FROM projects WHERE id = ?", id))) return c.json({ error: "No such project." }, 404);
    await c.env.DB.batch([c.env.DB.prepare("DELETE FROM milestones WHERE project_id = ?").bind(id), c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(id)]);
    return c.json({ ok: true });
  });

  app.post("/api/projects/:id/milestones", async (c) => {
    const { title } = await body<{ title?: unknown }>(c);
    const t = text(title, 120);
    if (!t) return c.json({ error: "Milestone needs a title (up to 120 characters)." }, 400);
    const id = c.req.param("id");
    if (!(await one(c.env.DB, "SELECT 1 FROM projects WHERE id = ?", id))) return c.json({ error: "No such project." }, 404);
    const max = await c.env.DB.prepare("SELECT MAX(pos) AS m FROM milestones WHERE project_id = ?").bind(id).first<{ m: number | null }>();
    const r = await c.env.DB.prepare("INSERT INTO milestones (project_id, title, pos) VALUES (?,?,?)").bind(id, t, (max?.m ?? 0) + 1).run();
    return c.json({ id: r.meta.last_row_id }, 201);
  });

  app.patch("/api/milestones/:id", async (c) => {
    const { title, done } = await body<{ title?: unknown; done?: boolean }>(c);
    if (title !== undefined && !text(title, 120)) return c.json({ error: "Milestone needs a title (up to 120 characters)." }, 400);
    const r = await c.env.DB.prepare("UPDATE milestones SET title = COALESCE(?, title), done = COALESCE(?, done) WHERE id = ?")
      .bind(title === undefined ? null : text(title, 120), done === undefined ? null : done ? 1 : 0, c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such milestone." }, 404);
  });

  app.delete("/api/milestones/:id", async (c) => {
    const r = await c.env.DB.prepare("DELETE FROM milestones WHERE id = ?").bind(c.req.param("id")).run();
    return r.meta.changes ? c.json({ ok: true }) : c.json({ error: "No such milestone." }, 404);
  });

  // Today's routine: sleep rating, kickoff and shutdown. Only the fields sent change.
  app.put("/api/routine", async (c) => {
    const b = await body<{ sleep?: number | null; wins?: unknown; tomorrow?: unknown; kickoff?: boolean; shutdown?: boolean }>(c);
    if (b.sleep !== undefined && b.sleep !== null && !(Number.isInteger(b.sleep) && b.sleep >= 1 && b.sleep <= 5)) return c.json({ error: "Sleep must be 1 to 5." }, 400);
    for (const k of ["wins", "tomorrow"] as const) if (b[k] !== undefined && (typeof b[k] !== "string" || (b[k] as string).length > 1000)) return c.json({ error: `${k === "wins" ? "Wins" : "Tomorrow"} can be up to 1000 characters.` }, 400);
    const t = today();
    const stamp = (v: boolean | undefined) => (v === undefined ? 0 : 1);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR IGNORE INTO routine (day) VALUES (?)").bind(t),
      c.env.DB.prepare(
        `UPDATE routine SET sleep = CASE WHEN ? THEN ? ELSE sleep END, wins = CASE WHEN ? THEN ? ELSE wins END, tomorrow = CASE WHEN ? THEN ? ELSE tomorrow END,
           kickoff_at = CASE WHEN ? THEN ? ELSE kickoff_at END, shutdown_at = CASE WHEN ? THEN ? ELSE shutdown_at END WHERE day = ?`,
      ).bind(
        b.sleep === undefined ? 0 : 1, b.sleep ?? null, b.wins === undefined ? 0 : 1, ((b.wins as string | undefined) ?? "").trim(), b.tomorrow === undefined ? 0 : 1, ((b.tomorrow as string | undefined) ?? "").trim(),
        stamp(b.kickoff), b.kickoff ? nowIso() : null, stamp(b.shutdown), b.shutdown ? nowIso() : null, t,
      ),
    ]);
    return c.json({ ok: true });
  });

  // The reflection note for the current week.
  app.put("/api/review", async (c) => {
    const { note } = await body<{ note?: unknown }>(c);
    if (typeof note !== "string" || note.length > 2000) return c.json({ error: "The note can be up to 2000 characters." }, 400);
    await c.env.DB.prepare("INSERT INTO reviews (week_start, note) VALUES (?, ?) ON CONFLICT(week_start) DO UPDATE SET note = excluded.note").bind(weekStart(today()), note.trim()).run();
    return c.json({ ok: true });
  });
}
