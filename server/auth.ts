import type { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

export type Env = {
  Bindings: {
    DB: D1Database;
    /** Signs session cookies and keys the one-time email codes. */
    SESSION_SECRET?: string;
    /** Cloudflare Email Service binding, used to send one-time sign-in codes. */
    EMAIL?: SendEmail;
    /** Sender address for those emails; its domain must be onboarded to Email Sending. */
    MAIL_FROM?: string;
    /** Google OAuth Client ID for Calendar API v3 */
    GOOGLE_CLIENT_ID?: string;
    /** Google OAuth Client Secret for Calendar API v3 */
    GOOGLE_CLIENT_SECRET?: string;
    /** Google OAuth Redirect URI for SSO Login */
    GOOGLE_REDIRECT_URI?: string;
    /** Google OAuth Redirect URI for Calendar API v3 */
    GOOGLE_CALENDAR_REDIRECT_URI?: string;
    /** Comma-separated list of permitted emails (e.g. advaita974@gmail.com) */
    ALLOWED_GOOGLE_EMAILS?: string;
  };
};

const COOKIE = "session";
const DAY = 86_400;
const REMEMBER_SECS = 90 * DAY;
const SHORT_SECS = DAY;
// Per device: 5 tries lock for 15 minutes. Across all devices: 20 per hour, so one stranger
// can't lock you out for long, and a botnet still can't search 1,000,000 six-digit codes.
const IP_LIMIT = 5, IP_WINDOW = 15 * 60;
const GLOBAL_LIMIT = 20, GLOBAL_WINDOW = 60 * 60;
// One-time email codes: valid 10 minutes, 5 wrong guesses kill the code, one email per address per minute.
const CODE_TTL = 10 * 60, CODE_TRIES = 5, CODE_RESEND = 60;
// 100,000 is the most PBKDF2 rounds a Worker allows, so the minimum length does the rest.
const PBKDF2_ITERS = 100_000, MIN_PASSWORD = 12, MAX_PASSWORD = 200;
const PUBLIC_PATHS = new Set([
  "/api/calendar/feed.ics", "/api/google/callback", "/api/auth/google", "/api/auth/google/callback",
  "/api/auth/email/request", "/api/auth/email/set-password", "/api/auth/email/login",
]);

export type Mail = { to: string; subject: string; text: string };
export type SendMail = (env: Env["Bindings"], mail: Mail) => Promise<void>;
export const sendWithCloudflare: SendMail = async (env, mail) => {
  if (!env.EMAIL) throw new Error("Email sending isn't configured (no EMAIL binding).");
  await env.EMAIL.send({ to: mail.to, from: { email: env.MAIL_FROM ?? "login@advaitachandra.in", name: "Command Deck" }, subject: mail.subject, text: mail.text });
};

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}

async function hashCode(secret: string, email: string, code: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${email}:${code}`)));
}

const normalizeEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const looksLikeEmail = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Permitted addresses for every sign-in method: the env var, else the `allowed_google_emails` setting. */
async function allowedEmails(env: Env["Bindings"]) {
  const split = (s: string) => s.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const fromEnv = split(env.ALLOWED_GOOGLE_EMAILS || "");
  if (fromEnv.length) return fromEnv;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'allowed_google_emails'").first<{ value: string }>();
  return row?.value ? split(row.value) : [];
}

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

export async function hasValidSession(c: C, nowS: number) {
  const secret = c.env.SESSION_SECRET;
  if (!secret) return false;
  const value = await getSignedCookie(c, secret, COOKIE);
  if (!value) return false; // missing, or the signature didn't match
  const [exp, ver] = value.split(".").map(Number);
  return exp > nowS && ver === (await sessionVersion(c.env.DB));
}

function cleanCred(val?: string | null): string {
  if (!val) return "";
  return val.trim().replace(/^[\uFEFF\u200B]+/, "").replace(/[\r\n]+$/, "");
}

/** Resolves Google OAuth credentials from environment bindings or D1 settings */
export async function getGoogleAuthCredentials(
  db: D1Database,
  env: Env["Bindings"],
  requestUrl?: string
): Promise<{ clientId: string; clientSecret: string; redirectUri: string } | null> {
  let clientId = cleanCred(env.GOOGLE_CLIENT_ID);
  let clientSecret = cleanCred(env.GOOGLE_CLIENT_SECRET);
  let redirectUri = cleanCred(env.GOOGLE_REDIRECT_URI);

  if (!clientId || !clientSecret) {
    const rows = (
      await db
        .prepare("SELECT key, value FROM settings WHERE key IN ('google_client_id', 'google_client_secret', 'google_redirect_uri')")
        .all<{ key: string; value: string }>()
    ).results;
    for (const r of rows) {
      if (r.key === "google_client_id" && !clientId) clientId = cleanCred(r.value);
      if (r.key === "google_client_secret" && !clientSecret) clientSecret = cleanCred(r.value);
      if (r.key === "google_redirect_uri" && !redirectUri) redirectUri = cleanCred(r.value);
    }
  }

  if (!redirectUri && requestUrl) {
    try {
      const urlObj = new URL(requestUrl);
      redirectUri = `${urlObj.origin}/api/auth/google/callback`;
    } catch {
      // ignore
    }
  }

  if (!redirectUri) {
    redirectUri = "https://deck.advaitachandra.in/api/auth/google/callback";
  }

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}


/** Cross-scheme HTTPS->HTTP redirects drop Lax cookies on localhost, so the D1 OAuth-state fallback is only honoured there. */
export const isLocalDev = (url: string) => ["localhost", "127.0.0.1"].includes(new URL(url).hostname);

/** Registers Google and email sign-in, /api/logout, and guards every other /api route. */
export function registerAuth(app: Hono<Env>, now: () => number, fetchFn: typeof fetch = fetch, sendMail: SendMail = sendWithCloudflare) {
  const nowS = () => Math.floor(now() / 1000);
  const ipOf = (c: C) => c.req.header("cf-connecting-ip") ?? "unknown";

  /** Counts this try and refuses it (429) once the device or the whole app is over its limit. */
  const throttle = async (c: C): Promise<Response | null> => {
    const db = c.env.DB, t = nowS(), ip = ipOf(c);
    await db.prepare("DELETE FROM login_attempts WHERE ts <= ?").bind(t - GLOBAL_WINDOW).run();
    // Record this try first, in the same batch as the check, so tries that arrive together can't all
    // see an empty log. The (N+1)th most recent try being inside the window means the limit is reached.
    const [added, mine, all] = await db.batch<{ ts: number }>([
      db.prepare("INSERT INTO login_attempts (ip, ts) VALUES (?, ?)").bind(ip, t),
      db.prepare("SELECT ts FROM login_attempts WHERE ip = ? ORDER BY ts DESC LIMIT 1 OFFSET ?").bind(ip, IP_LIMIT),
      db.prepare("SELECT ts FROM login_attempts ORDER BY ts DESC LIMIT 1 OFFSET ?").bind(GLOBAL_LIMIT),
    ]);
    const waits = [
      mine.results[0] && mine.results[0].ts + IP_WINDOW - t,
      all.results[0] && all.results[0].ts + GLOBAL_WINDOW - t,
    ].filter((w): w is number => typeof w === "number" && w > 0);
    if (!waits.length) return null;
    await db.prepare("DELETE FROM login_attempts WHERE rowid = ?").bind(added.meta.last_row_id).run(); // refused tries don't extend the lock
    const retryAfter = Math.max(...waits);
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many tries. Try again later.", retryAfter }, 429);
  };
  const attemptsLeft = async (c: C) => {
    const n = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND ts > ?").bind(ipOf(c), nowS() - IP_WINDOW).first<{ n: number }>())?.n ?? 0;
    return Math.max(0, IP_LIMIT - n);
  };

  /** Signs the visitor in: forgives this device's earlier tries and sets the session cookie. */
  const startSession = async (c: C, remember: boolean) => {
    const secret = c.env.SESSION_SECRET!, db = c.env.DB, t = nowS();
    await db.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ipOf(c)).run();
    const ttl = remember ? REMEMBER_SECS : SHORT_SECS;
    await setSignedCookie(c, COOKIE, `${t + ttl}.${await sessionVersion(db)}`, secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Strict",
      path: "/",
      ...(remember ? { maxAge: ttl } : {}), // otherwise a browser-session cookie that also expires after a day
    });
  };

  // --- Google OAuth 2.0 Initiation Handler ---
  app.get("/api/auth/google", async (c) => {
    const secret = c.env.SESSION_SECRET;
    if (!secret) return c.json({ error: "Server auth isn't configured." }, 500);

    const creds = await getGoogleAuthCredentials(c.env.DB, c.env, c.req.url);
    if (!creds) {
      return c.json({ error: "Google OAuth credentials are not configured on the server." }, 500);
    }

    // 1. Generate cryptographically secure random state nonce
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);
    const stateNonce = Array.from(nonceBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 2. Store the state in an encrypted, short-lived (10-minute), HttpOnly, SameSite=Lax cookie (oauth_state)
    await setSignedCookie(c, "oauth_state", stateNonce, secret, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Lax",
      path: "/",
      maxAge: 600, // 10 minutes
    });

    // 2b. Also persist in D1 settings as a fallback for localhost cross-scheme (HTTPS -> HTTP) cookie dropping.
    // Never in production: a shared row isn't bound to the browser that started the flow.
    if (isLocalDev(c.req.url)) {
      const expiresAtS = nowS() + 600;
      await c.env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES ('google_login_state', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      ).bind(`${stateNonce}:${expiresAtS}`).run();
    }

    // 3. Redirect user to Google OAuth endpoint with prompt: select_account
    const p = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: creds.redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state: stateNonce,
      prompt: "select_account",
    });

    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`);
  });

  // --- Google OAuth 2.0 Callback & Strict Whitelist Verification ---
  app.get("/api/auth/google/callback", async (c) => {
    const secret = c.env.SESSION_SECRET;
    const db = c.env.DB;
    if (!secret) return c.json({ error: "Server auth isn't configured." }, 500);

    const errorParam = c.req.query("error");
    if (errorParam) {
      return c.redirect(`/?error=${encodeURIComponent(errorParam)}`);
    }

    // 1. CSRF State Validation
    const state = c.req.query("state");
    const cookieState = await getSignedCookie(c, secret, "oauth_state");
    deleteCookie(c, "oauth_state", { path: "/" });

    let stateValid = false;
    if (state && cookieState && (await same(state, cookieState))) {
      stateValid = true;
    }

    // Fallback: Check D1 settings table if cookie was dropped by cross-scheme HTTPS->HTTP redirect (e.g. localhost dev)
    if (!stateValid && state && isLocalDev(c.req.url)) {
      const row = await db.prepare("SELECT value FROM settings WHERE key = 'google_login_state'").first<{ value: string }>();
      if (row?.value) {
        const [savedNonce, expiryStr] = row.value.split(":");
        const expiry = Number(expiryStr);
        if (savedNonce && expiry >= nowS() && (await same(state, savedNonce))) {
          stateValid = true;
        }
      }
    }

    // Single-use guarantee: clear saved state immediately
    if (isLocalDev(c.req.url)) await db.prepare("DELETE FROM settings WHERE key = 'google_login_state'").run().catch(() => null);

    if (!stateValid) {
      return c.text("Invalid OAuth State", 400);
    }

    const code = c.req.query("code");
    if (!code) {
      return c.text("Missing authorization code", 400);
    }

    const creds = await getGoogleAuthCredentials(db, c.env, c.req.url);
    if (!creds) {
      return c.json({ error: "Google OAuth credentials are not configured on the server." }, 500);
    }

    // 2. Code Exchange
    const tokenParams = new URLSearchParams({
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: creds.redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetchFn("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("Token exchange failed:", errText);
      return c.redirect("/?error=oauth_token_failed");
    }

    const tokenData = (await tokenRes.json().catch(() => ({}))) as {
      access_token?: string;
      id_token?: string;
      error?: string;
    };

    if (!tokenData.access_token && !tokenData.id_token) {
      return c.text("Missing tokens from Google response.", 400);
    }

    // 3. Identity Verification & Whitelisting
    let email = "";
    let emailVerified = false;

    if (tokenData.access_token) {
      const userinfoRes = await fetchFn("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        const info = (await userinfoRes.json().catch(() => ({}))) as {
          email?: string;
          email_verified?: boolean;
        };
        email = (info.email || "").trim();
        emailVerified = info.email_verified === true;
      }
    }

    if (!email && tokenData.id_token) {
      try {
        const parts = tokenData.id_token.split(".");
        if (parts.length >= 2) {
          const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
          const payload = JSON.parse(payloadJson);
          email = (payload.email || "").trim();
          emailVerified = payload.email_verified === true;
        }
      } catch (e) {
        console.error("Failed to decode id_token:", e);
      }
    }

    if (!email || !emailVerified) {
      return c.html("<h3>Access Denied</h3><p>Google account email is not verified.</p>", 403);
    }

    // CRITICAL RESTRICTION CHECK
    if (!(await allowedEmails(c.env)).includes(email.toLowerCase())) {
      console.warn(`Unauthorized login attempt by non-whitelisted account: ${email}`);
      return c.html(
        `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Access Denied — Command Deck</title>
  <style>
    body { background: #07080b; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: grid; min-height: 100vh; place-items: center; margin: 0; padding: 1.5rem; box-sizing: border-box; }
    .card { background: rgba(18, 18, 20, 0.95); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 20px; padding: 2.25rem 2rem; max-width: 440px; width: 100%; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.6); }
    h3 { margin: 0 0 0.75rem; color: #ef4444; font-size: 1.35rem; font-weight: 700; letter-spacing: -0.02em; }
    p { margin: 0 0 1.25rem; color: #a1a1aa; font-size: 0.9rem; line-height: 1.5; }
    .email-chip { display: inline-block; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.25rem 0.6rem; color: #f5f5f7; font-family: monospace; font-size: 0.85rem; margin-bottom: 1.5rem; }
    a { display: inline-block; background: #27272a; color: #ffffff; text-decoration: none; padding: 0.7rem 1.4rem; border-radius: 12px; font-size: 0.875rem; font-weight: 600; transition: all 0.15s ease; border: 1px solid rgba(255,255,255,0.08); }
    a:hover { background: #3f3f46; transform: scale(1.02); }
  </style>
</head>
<body>
  <div class="card">
    <h3>Access Denied</h3>
    <p>This account is not authorized to access Command Deck.</p>
    <div><span class="email-chip">${email}</span></div>
    <a href="/?error=unauthorized">Return to Login</a>
  </div>
</body>
</html>`,
        403
      );
    }

    // 4. Session Issuance
    await startSession(c, true);
    return c.redirect("/");
  });

  // --- Email + password. The address is proven by a one-time code sent to it; only allow-listed addresses get one. ---
  const emailBody = async (c: C) => ((await c.req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  const wrongCode = async (c: C) => c.json({ error: "That code didn't work.", attemptsLeft: await attemptsLeft(c) }, 401);

  app.post("/api/auth/email/request", async (c) => {
    if (!c.env.SESSION_SECRET) return c.json({ error: "Login isn't set up on the server yet." }, 500);
    const blocked = await throttle(c);
    if (blocked) return blocked;
    const email = normalizeEmail((await emailBody(c)).email);
    if (!looksLikeEmail(email)) return c.json({ error: "Enter a valid email address." }, 400);
    const db = c.env.DB, t = nowS();
    // The answer is the same whether or not the address is allowed, so this can't be used to probe the list.
    if ((await allowedEmails(c.env)).includes(email)) {
      const last = await db.prepare("SELECT sent_at FROM email_codes WHERE email = ?").bind(email).first<{ sent_at: number }>();
      if (!last || t - last.sent_at >= CODE_RESEND) {
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
        await db.prepare(
          "INSERT INTO email_codes (email, code_hash, expires_at, sent_at, tries) VALUES (?, ?, ?, ?, 0) " +
          "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, sent_at = excluded.sent_at, tries = 0",
        ).bind(email, await hashCode(c.env.SESSION_SECRET, email, code), t + CODE_TTL, t).run();
        try {
          await sendMail(c.env, {
            to: email,
            subject: `Your Command Deck code: ${code}`,
            text: `Your Command Deck sign-in code is ${code}.\n\nIt works once and expires in ${CODE_TTL / 60} minutes. If you didn't ask for it, ignore this email: nobody can sign in without it.`,
          });
        } catch (e) {
          console.error("Sending the sign-in email failed:", e instanceof Error ? e.message : e);
        }
      }
    }
    return c.json({ ok: true });
  });

  app.post("/api/auth/email/set-password", async (c) => {
    const secret = c.env.SESSION_SECRET;
    if (!secret) return c.json({ error: "Login isn't set up on the server yet." }, 500);
    const blocked = await throttle(c);
    if (blocked) return blocked;
    const b = await emailBody(c);
    const email = normalizeEmail(b.email);
    if (typeof b.code !== "string" || typeof b.password !== "string") return wrongCode(c);
    if (b.password.length < MIN_PASSWORD || b.password.length > MAX_PASSWORD) {
      return c.json({ error: `Use a password of ${MIN_PASSWORD} to ${MAX_PASSWORD} characters.` }, 400);
    }
    const db = c.env.DB, t = nowS();
    const row = (await allowedEmails(c.env)).includes(email)
      ? await db.prepare("SELECT code_hash, expires_at, tries FROM email_codes WHERE email = ?").bind(email).first<{ code_hash: string; expires_at: number; tries: number }>()
      : null;
    if (!row || row.expires_at < t || row.tries >= CODE_TRIES) return wrongCode(c);
    if (!(await same(await hashCode(secret, email, b.code.trim()), row.code_hash))) {
      // The Nth wrong guess kills the code, so a code can't be searched within its 10 minutes.
      await db.prepare(row.tries + 1 >= CODE_TRIES ? "DELETE FROM email_codes WHERE email = ?" : "UPDATE email_codes SET tries = tries + 1 WHERE email = ?").bind(email).run();
      return wrongCode(c);
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    await db.batch([
      db.prepare(
        "INSERT INTO credentials (email, pw_hash, salt, iterations, updated_at) VALUES (?, ?, ?, ?, ?) " +
        "ON CONFLICT(email) DO UPDATE SET pw_hash = excluded.pw_hash, salt = excluded.salt, iterations = excluded.iterations, updated_at = excluded.updated_at",
      ).bind(email, await hashPassword(b.password, salt, PBKDF2_ITERS), hex(salt), PBKDF2_ITERS, t),
      db.prepare("DELETE FROM email_codes WHERE email = ?").bind(email),
      db.prepare("UPDATE auth_state SET session_version = session_version + 1 WHERE id = 1"), // a new password signs out every other device
    ]);
    await startSession(c, b.remember === true);
    return c.json({ ok: true });
  });

  app.post("/api/auth/email/login", async (c) => {
    if (!c.env.SESSION_SECRET) return c.json({ error: "Login isn't set up on the server yet." }, 500);
    const blocked = await throttle(c);
    if (blocked) return blocked;
    const b = await emailBody(c);
    const email = normalizeEmail(b.email);
    const password = typeof b.password === "string" ? b.password.slice(0, MAX_PASSWORD) : "";
    const row = (await allowedEmails(c.env)).includes(email)
      ? await c.env.DB.prepare("SELECT pw_hash, salt, iterations FROM credentials WHERE email = ?").bind(email).first<{ pw_hash: string; salt: string; iterations: number }>()
      : null;
    // Hash even when there is no such account, so the response time doesn't reveal which addresses exist.
    const hash = await hashPassword(password, row ? unhex(row.salt) : new Uint8Array(16), row?.iterations ?? PBKDF2_ITERS);
    if (!row || !password || !(await same(hash, row.pw_hash))) {
      return c.json({ error: "Wrong email or password.", attemptsLeft: await attemptsLeft(c) }, 401);
    }
    await startSession(c, b.remember === true);
    return c.json({ ok: true });
  });

  app.post("/api/logout", (c) => {
    deleteCookie(c, COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Fail closed: with no session secret configured, nothing is reachable.
  app.use("/api/*", async (c, next) => {
    if (!c.env.SESSION_SECRET) return c.json({ error: "Server auth isn't configured." }, 500);
    // The calendar feed, the Google callbacks and the sign-in routes manage their own verification.
    if (PUBLIC_PATHS.has(c.req.path)) return next();
    if (await hasValidSession(c, nowS())) {
      // Belt and braces on top of SameSite=Strict: refuse cookie-authenticated writes from another origin.
      const origin = c.req.header("origin");
      if (origin && c.req.method !== "GET" && origin !== new URL(c.req.url).origin) {
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

