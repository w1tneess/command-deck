import { getPlatformProxy } from "wrangler";
import { serializeSigned } from "hono/utils/cookie";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";

const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");
export const EMAIL = "advaita974@gmail.com";

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
  /** Allowed Google emails whitelist */
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
  const app = createApp({ now: () => clock, fetchFn: opts.fetchFn });
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
  /** A session cookie signed the way the app signs it. Version 1 is what a fresh database starts at. */
  const mintCookie = async (ttlSeconds = 90 * 86_400, version = 1) =>
    (await serializeSigned("session", `${Math.floor(clock / 1000) + ttlSeconds}.${version}`, secret ?? "test-secret")).split(";")[0];
  return { db, inject, mintCookie, dispose: () => proxy.dispose(), setNow: (ms: number) => { clock = ms; }, now: () => clock };
}
