import type { Context, Hono } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

export type Env = {
  Bindings: {
    DB: D1Database;
    /** Signs session cookies. */
    SESSION_SECRET?: string;
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
const REMEMBER_SECS = 90 * 86_400;
const PUBLIC_PATHS = new Set(["/api/calendar/feed.ics", "/api/google/callback", "/api/auth/google", "/api/auth/google/callback"]);

/** Permitted Google addresses: the env var, else the `allowed_google_emails` setting. */
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

/** Registers Google sign-in, /api/logout, and guards every other /api route. */
export function registerAuth(app: Hono<Env>, now: () => number, fetchFn: typeof fetch = fetch) {
  const nowS = () => Math.floor(now() / 1000);

  /** Signs the visitor in with a 90-day session cookie. */
  const startSession = async (c: C) => {
    await setSignedCookie(c, COOKIE, `${nowS() + REMEMBER_SECS}.${await sessionVersion(c.env.DB)}`, c.env.SESSION_SECRET!, {
      httpOnly: true,
      secure: c.req.url.startsWith("https:"),
      sameSite: "Strict",
      path: "/",
      maxAge: REMEMBER_SECS,
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
      console.warn("Unauthorized login attempt by a non-whitelisted account");
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
    <div><span class="email-chip">${email.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)}</span></div>
    <a href="/?error=unauthorized">Return to Login</a>
  </div>
</body>
</html>`,
        403
      );
    }

    // 4. Session Issuance
    await startSession(c);
    return c.redirect("/");
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

