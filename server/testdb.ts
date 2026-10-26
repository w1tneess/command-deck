import { getPlatformProxy } from "wrangler";
import { serializeSigned } from "hono/utils/cookie";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import type { Mail } from "./auth.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");
export const EMAIL = "advaita974@gmail.com";
export const PASSWORD = "correct-horse-battery";

type Opts = {
  /** SESSION_SECRET; null leaves it unset. */
  secret?: string | null;
  /** Google OAuth Client ID */
  googleClientId?: string | null;
  /** Google OAuth Client Secret */
  googleClientSecret?: string | null;
  /** Google OAuth Redirect URI for SSO Login */
  googleRedirectUri?: string | null;
  /** Google OAuth Redirect URI for Calendar */
  googleCalendarRedirectUri?: string | null;
  /** Allowed emails whitelist (Google and email sign-in) */
  allowedGoogleEmails?: string | null;
  /** "session" (default) signs every call in with a valid cookie; "none" sends nothing so tests can sign in themselves. */
  auth?: "session" | "none";
  now?: number;
  fetchFn?: typeof fetch;
};

/** A real (local, in-memory) D1 database from the deployed wrangler.jsonc, with the project's migrations applied. */
export async function setup(opts: Opts = {}) {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: resolve(ROOT, "wrangler.jsonc"), persist: false });
  const db = proxy.env.DB;
  for (const f of readdirSync(MIGRATIONS).sort()) {
    const stmts = readFileSync(resolve(MIGRATIONS, f), "utf8").split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    await db.batch(stmts.map((s) => db.prepare(s)));
  }
  let clock = opts.now ?? Date.parse("2026-10-22T06:00:00Z");
  /** Every email the app tried to send, newest last. */
  const mails: Mail[] = [];
  const app = createApp({ now: () => clock, fetchFn: opts.fetchFn, sendMail: async (_env, mail) => { mails.push(mail); } });
  const secret = opts.secret === undefined ? "test-secret" : opts.secret ?? undefined;
  const env = {
    DB: db,
    SESSION_SECRET: secret,
    GOOGLE_CLIENT_ID: opts.googleClientId ?? undefined,
    GOOGLE_CLIENT_SECRET: opts.googleClientSecret ?? undefined,
    GOOGLE_REDIRECT_URI: opts.googleRedirectUri ?? undefined,
    GOOGLE_CALENDAR_REDIRECT_URI: opts.googleCalendarRedirectUri ?? undefined,
    ALLOWED_GOOGLE_EMAILS: opts.allowedGoogleEmails ?? EMAIL,
  };
  // A session cookie good for ten years, signed the way the app signs it, so ordinary tests start signed in.
  const signedIn = (opts.auth ?? "session") === "session" && secret
    ? (await serializeSigned("session", `${Math.floor(clock / 1000) + 10 * 365 * 86_400}.1`, secret)).split(";")[0]
    : null;
  /** Same call shape as Fastify's inject, with the session cookie added unless a test overrides it. */
  const inject = (arg: string | { method?: string; url: string; payload?: unknown; headers?: Record<string, string> }) => {
    const o = typeof arg === "string" ? { url: arg } : arg;
    const headers: Record<string, string> = { ...(signedIn ? { cookie: signedIn } : {}), ...(o.payload ? { "content-type": "application/json" } : {}), ...o.headers };
    return app.request(o.url, { method: o.method ?? "GET", headers, body: o.payload ? JSON.stringify(o.payload) : undefined }, env);
  };
  /** Signs in through the real email flow (first time: code, then password; after that: password) and returns the session cookie. */
  const signIn = async (remember = true, ip = "1.1.1.1") => {
    const headers = { "cf-connecting-ip": ip };
    const known = await db.prepare("SELECT 1 AS x FROM credentials WHERE email = ?").bind(EMAIL).first();
    let res: Response;
    if (known) {
      res = await inject({ method: "POST", url: "/api/auth/email/login", payload: { email: EMAIL, password: PASSWORD, remember }, headers });
    } else {
      await inject({ method: "POST", url: "/api/auth/email/request", payload: { email: EMAIL }, headers });
      const code = mails.at(-1)!.text.match(/\b(\d{6})\b/)![1];
      res = await inject({ method: "POST", url: "/api/auth/email/set-password", payload: { email: EMAIL, code, password: PASSWORD, remember }, headers });
    }
    if (res.status !== 200) throw new Error(`test sign-in failed: ${res.status} ${await res.text()}`);
    return res.headers.get("set-cookie")!.split(";")[0];
  };
  return { db, inject, mails, signIn, dispose: () => proxy.dispose(), setNow: (ms: number) => { clock = ms; }, now: () => clock };
}
