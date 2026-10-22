import type { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

export type Env = {
  Bindings: {
    DB: D1Database;
    /** Recovery and automation bearer token. Still accepted alongside the PIN. */
    APP_TOKEN?: string;
    /** The 6-digit PIN, set by the owner with `wrangler secret put`. */
    STUDY_PASSCODE?: string;
    /** Signs session cookies. */
    SESSION_SECRET?: string;
  };
};

const COOKIE = "session";
const DAY = 86_400;
const REMEMBER_SECS = 90 * DAY;
const SHORT_SECS = DAY;
// Per device: 5 wrong tries lock for 15 minutes. Across all devices: 20 per hour, so one
// stranger can't lock you out for long, and a botnet still can't search 1,000,000 PINs.
const IP_LIMIT = 5, IP_WINDOW = 15 * 60;
const GLOBAL_LIMIT = 20, GLOBAL_WINDOW = 60 * 60;

/** Hash both sides first so the comparison is constant-time whatever the lengths. */
export async function same(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest("SHA-256", enc.encode(a)), crypto.subtle.digest("SHA-256", enc.encode(b))]);
  const p = new Uint8Array(x), q = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i] ^ q[i]; // no early exit, so timing doesn't leak the match length
  return diff === 0;
}

type C = Context<Env>;
const sessionVersion = async (db: D1Database) =>
  (await db.prepare("SELECT session_version AS v FROM auth_state WHERE id = 1").first<{ v: number }>())?.v ?? 0;

async function hasValidSession(c: C, nowS: number) {
  const secret = c.env.SESSION_SECRET;
  if (!secret) return false;
  const value = await getSignedCookie(c, secret, COOKIE);
  if (!value) return false; // missing, or the signature didn't match
  const [exp, ver] = value.split(".").map(Number);
  return exp > nowS && ver === (await sessionVersion(c.env.DB));
}

/** Registers /api/login, /api/logout and /api/logout-all, and guards every other /api route. */
export function registerAuth(app: Hono<Env>, now: () => number) {
  const nowS = () => Math.floor(now() / 1000);

  app.post("/api/login", async (c) => {
    const { STUDY_PASSCODE: pin, SESSION_SECRET: secret, DB: db } = c.env;
    if (!pin || !secret) return c.json({ error: "Login isn't set up on the server yet." }, 500);
    const t = nowS();
    const ip = c.req.header("cf-connecting-ip") ?? "unknown";
    await db.prepare("DELETE FROM login_attempts WHERE ts <= ?").bind(t - GLOBAL_WINDOW).run();

    // The Nth most recent failure being inside the window means the limit is reached.
    const [mine, all] = await db.batch<{ ts: number }>([
      db.prepare("SELECT ts FROM login_attempts WHERE ip = ? ORDER BY ts DESC LIMIT 1 OFFSET ?").bind(ip, IP_LIMIT - 1),
      db.prepare("SELECT ts FROM login_attempts ORDER BY ts DESC LIMIT 1 OFFSET ?").bind(GLOBAL_LIMIT - 1),
    ]);
    const waits = [
      mine.results[0] && mine.results[0].ts + IP_WINDOW - t,
      all.results[0] && all.results[0].ts + GLOBAL_WINDOW - t,
    ].filter((w): w is number => typeof w === "number" && w > 0);
    if (waits.length) {
      const retryAfter = Math.max(...waits);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "Too many wrong tries. Try again later.", retryAfter }, 429);
    }

    const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { pin?: unknown; remember?: unknown };
    if (typeof body.pin !== "string" || !(await same(body.pin, pin))) {
      await db.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)").bind(ip, t).run();
      const n = (await db.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?").bind(ip, t - IP_WINDOW).first<{ n: number }>())?.n ?? 0;
      return c.json({ error: "Wrong PIN.", attemptsLeft: Math.max(0, IP_LIMIT - n) }, 401);
    }

    await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
    const remember = body.remember === true;
    const ttl = remember ? REMEMBER_SECS : SHORT_SECS;
    await setSignedCookie(c, COOKIE, `${t + ttl}.${await sessionVersion(db)}`, secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Strict",
      path: "/",
      ...(remember ? { maxAge: ttl } : {}), // otherwise a browser-session cookie that also expires after a day
    });
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Fail closed: with neither a token nor a session secret configured, nothing is reachable.
  app.use("/api/*", async (c, next) => {
    if (!c.env.APP_TOKEN && !c.env.SESSION_SECRET) return c.json({ error: "Server auth isn't configured." }, 500);
    if (c.env.APP_TOKEN && (await same(c.req.header("authorization") ?? "", `Bearer ${c.env.APP_TOKEN}`))) return next();
    if (await hasValidSession(c, nowS())) {
      // Belt and braces on top of SameSite=Strict: refuse cookie-authenticated writes from another origin.
      const origin = c.req.header("origin");
      if (origin && c.req.method !== "GET" && new URL(origin).host !== new URL(c.req.url).host) {
        return c.json({ error: "Cross-site request blocked." }, 403);
      }
      return next();
    }
    return c.json({ error: "Please sign in." }, 401);
  });

  app.post("/api/logout-all", async (c) => {
    await c.env.DB.prepare("UPDATE auth_state SET session_version = session_version + 1 WHERE id = 1").run();
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });
}
