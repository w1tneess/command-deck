import { getPlatformProxy } from "wrangler";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp } from "./app.ts";

export const TOKEN = "test-token";
const ROOT = resolve(import.meta.dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");

/** A real (local, in-memory) D1 database from the deployed wrangler.jsonc, with the project's migrations applied. */
export async function setup(opts: { token?: string | null; now?: number } = {}) {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: resolve(ROOT, "wrangler.jsonc"), persist: false });
  const db = proxy.env.DB;
  for (const f of readdirSync(MIGRATIONS).sort()) {
    const stmts = readFileSync(resolve(MIGRATIONS, f), "utf8").split(/;\s*(?:\r?\n|$)/).map((s) => s.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
    await db.batch(stmts.map((s) => db.prepare(s)));
  }
  const app = createApp({ now: () => opts.now ?? Date.parse("2026-10-22T06:00:00Z") });
  const token = opts.token === undefined ? TOKEN : opts.token ?? undefined;
  const env = { DB: db, APP_TOKEN: token };
  /** Same call shape as Fastify's inject, with the auth header added unless a test overrides it. */
  const inject = (arg: string | { method?: string; url: string; payload?: unknown; headers?: Record<string, string> }) => {
    const o = typeof arg === "string" ? { url: arg } : arg;
    const headers: Record<string, string> = { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(o.payload ? { "content-type": "application/json" } : {}), ...o.headers };
    return app.request(o.url, { method: o.method ?? "GET", headers, body: o.payload ? JSON.stringify(o.payload) : undefined }, env);
  };
  return { db, inject, dispose: () => proxy.dispose() };
}
