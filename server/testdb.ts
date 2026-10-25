import { getPlatformProxy } from "wrangler";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";

export const TOKEN = "test-token";
export const PIN = "123456";
const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");

type Opts = {
  /** APP_TOKEN secret; null leaves it unset. */
  token?: string | null;
  /** SESSION_SECRET; null leaves it unset. */
  secret?: string | null;
  /** STUDY_PASSCODE; null leaves it unset. */
  pin?: string | null;
  /** Google OAuth Client ID */
  googleClientId?: string | null;
  /** Google OAuth Client Secret */
  googleClientSecret?: string | null;
  /** Google OAuth Redirect URI for SSO Login */
  googleRedirectUri?: string | null;
  /** Google OAuth Redirect URI for Calendar */
  googleCalendarRedirectUri?: string | null;
  /** Allowed Google Emails whitelist */
  allowedGoogleEmails?: string | null;
  /** "bearer" (default) sends the token on every call; "none" sends nothing so tests can use cookies. */
  auth?: "bearer" | "none";
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
  const app = createApp({ now: () => clock, fetchFn: opts.fetchFn });
  const pick = (v: string | null | undefined, dflt: string) => (v === undefined ? dflt : v ?? undefined);
  const token = pick(opts.token, TOKEN);
  const env = {
    DB: db,
    APP_TOKEN: token,
    SESSION_SECRET: pick(opts.secret, "test-secret"),
    STUDY_PASSCODE: pick(opts.pin, PIN),
    GOOGLE_CLIENT_ID: opts.googleClientId ?? undefined,
    GOOGLE_CLIENT_SECRET: opts.googleClientSecret ?? undefined,
    GOOGLE_REDIRECT_URI: opts.googleRedirectUri ?? undefined,
    GOOGLE_CALENDAR_REDIRECT_URI: opts.googleCalendarRedirectUri ?? undefined,
    ALLOWED_GOOGLE_EMAILS: opts.allowedGoogleEmails ?? "advaita974@gmail.com",
  };
  const sendToken = (opts.auth ?? "bearer") === "bearer" && token;
  /** Same call shape as Fastify's inject, with the auth header added unless a test overrides it. */
  const inject = (arg: string | { method?: string; url: string; payload?: unknown; headers?: Record<string, string> }) => {
    const o = typeof arg === "string" ? { url: arg } : arg;
    const headers: Record<string, string> = { ...(sendToken ? { authorization: `Bearer ${token}` } : {}), ...(o.payload ? { "content-type": "application/json" } : {}), ...o.headers };
    return app.request(o.url, { method: o.method ?? "GET", headers, body: o.payload ? JSON.stringify(o.payload) : undefined }, env);
  };
  return { db, inject, dispose: () => proxy.dispose(), setNow: (ms: number) => { clock = ms; }, now: () => clock };
}
