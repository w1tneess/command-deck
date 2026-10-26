/**
 * Google Cloud Calendar API v3 Two-Way Live Sync Engine.
 * Strictly adheres to Indian Standard Time (IST, UTC+5:30) via Asia/Kolkata.
 * Zero external npm dependencies — uses native Web Fetch, Crypto, and D1 parameterized queries.
 */

import type { Env } from "./auth.ts";
import type { ScheduleBlock } from "./calendar.ts";

export type GoogleSyncRow = {
  id: number;
  refresh_token: string;
  access_token: string | null;
  expires_at: number;
  calendar_id: string;
  last_synced_at: string | null;
  sync_token: string | null;
  scope: string | null;
  two_way: number;
};

export type ExternalEventRow = {
  id: string;
  summary: string;
  description: string | null;
  starts_at: string; // ISO with IST offset (+05:30)
  ends_at: string;   // ISO with IST offset (+05:30)
  is_study_block: number;
  updated_at: string;
};

export type ExternalEvent = {
  id: string;
  summary: string;
  description: string | null;
  startsAt: string; // ISO with IST offset (+05:30)
  endsAt: string;   // ISO with IST offset (+05:30)
  isStudyBlock: boolean;
  updatedAt: string;
};

export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type ScheduleConflict = {
  blockId: number;
  blockTitle: string;
  blockStart: string;
  blockEnd: string;
  eventId: string;
  eventSummary: string;
  eventStart: string;
  eventEnd: string;
};

const DEFAULT_REDIRECT_URI = "https://deck.advaitachandra.in/api/google/callback";
const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
/** Full calendar access: events plus the calendar list, so a dedicated "Command Deck" calendar can be created. */
const SCOPES = "https://www.googleapis.com/auth/calendar";

/** Map category to Google Calendar colorId */
export function categoryToGoogleColorId(category: string): string {
  switch (category) {
    case "morning": return "7";   // Peacock / Sky
    case "school": return "5";    // Banana / Amber
    case "revision": return "9";  // Blueberry / Indigo
    case "practice": return "3";  // Grape / Purple
    case "winddown": return "4";  // Flamingo / Rose
    default: return "2";          // Sage / Emerald
  }
}

/** Formats epoch ms into an ISO string with +05:30 offset */
export function toIstIso(epochMs: number): string {
  const d = new Date(epochMs + 5.5 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const m = pad(d.getUTCMonth() + 1);
  const day = pad(d.getUTCDate());
  const h = pad(d.getUTCHours());
  const min = pad(d.getUTCMinutes());
  const s = pad(d.getUTCSeconds());
  return `${y}-${m}-${day}T${h}:${min}:${s}+05:30`;
}

/** Parses any ISO or date string and converts it to IST ISO with +05:30 */
export function normalizeToIstIso(dateTimeStr?: string | null, dateStr?: string | null, isEnd = false): string {
  if (dateTimeStr) {
    const epochMs = Date.parse(dateTimeStr);
    if (!isNaN(epochMs)) return toIstIso(epochMs);
  }
  if (dateStr) {
    // All-day event: start at 00:00:00 or end at 23:59:59 IST
    return `${dateStr}T${isEnd ? "23:59:59" : "00:00:00"}+05:30`;
  }
  return toIstIso(Date.now());
}

function cleanCred(val?: string | null): string {
  if (!val) return "";
  return val.trim().replace(/^[\uFEFF\u200B]+/, "").replace(/[\r\n]+$/, "");
}

/** Retrieves Google OAuth credentials from Env bindings or settings table */
export async function getGoogleCredentials(db: D1Database, env: Env["Bindings"], requestOrigin?: string): Promise<GoogleCredentials | null> {
  let clientId = cleanCred(env.GOOGLE_CLIENT_ID);
  let clientSecret = cleanCred(env.GOOGLE_CLIENT_SECRET);
  // Ensure calendar uses the dedicated calendar redirect URI, never the auth/login redirect URI
  let redirectUri = cleanCred(env.GOOGLE_CALENDAR_REDIRECT_URI);
  if (!redirectUri && env.GOOGLE_REDIRECT_URI && !env.GOOGLE_REDIRECT_URI.includes("/api/auth/google/callback")) {
    redirectUri = cleanCred(env.GOOGLE_REDIRECT_URI);
  }

  if (!clientId || !clientSecret || !redirectUri) {
    const rows = (await db.prepare("SELECT key, value FROM settings WHERE key IN ('google_client_id', 'google_client_secret', 'google_calendar_redirect_uri', 'google_redirect_uri')").all<{ key: string; value: string }>()).results;
    for (const r of rows) {
      if (r.key === "google_client_id" && !clientId) clientId = cleanCred(r.value);
      if (r.key === "google_client_secret" && !clientSecret) clientSecret = cleanCred(r.value);
      if (r.key === "google_calendar_redirect_uri" && !redirectUri) redirectUri = cleanCred(r.value);
      if (r.key === "google_redirect_uri" && !redirectUri && !r.value.includes("/api/auth/google/callback")) {
        redirectUri = cleanCred(r.value);
      }
    }
  }

  if (!redirectUri && requestOrigin) {
    redirectUri = `${requestOrigin}/api/google/callback`;
  }

  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri || DEFAULT_REDIRECT_URI,
  };
}

/** Constructs the Google OAuth 2.0 authorization URL */
export function buildGoogleAuthUrl(creds: GoogleCredentials, stateToken: string): string {
  const p = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: stateToken,
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${p.toString()}`;
}

/** Exchanges an OAuth authorization code for tokens */
export async function exchangeGoogleAuthCode(
  code: string,
  creds: GoogleCredentials,
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; scope: string }> {
  const p = new URLSearchParams({
    code,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    redirect_uri: creds.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
  if (!data.access_token || !data.refresh_token) {
    throw new Error(data.error || "Missing access_token or refresh_token in Google response.");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    scope: data.scope ?? "",
  };
}

/** Refreshes an expired access token using the stored refresh token */
export async function refreshGoogleAccessToken(
  refreshToken: string,
  creds: GoogleCredentials,
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; expiresIn: number }> {
  const p = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetchFn(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: p.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) {
    throw new Error(data.error || "Missing access_token in Google refresh response.");
  }

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? 3600,
  };
}

/** Retrieves a valid access token for the singleton sync row, refreshing if needed */
export async function getValidAccessToken(
  db: D1Database,
  env: Env["Bindings"],
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch
): Promise<{ accessToken: string; calendarId: string } | null> {
  const sync = await db.prepare("SELECT * FROM google_sync WHERE id = 1").first<GoogleSyncRow>();
  if (!sync || !sync.refresh_token) return null;

  // Buffer 60 seconds before expiration
  if (sync.access_token && sync.expires_at > nowMs + 60_000) {
    return { accessToken: sync.access_token, calendarId: sync.calendar_id || "primary" };
  }

  const creds = await getGoogleCredentials(db, env);
  if (!creds) {
    throw new Error("Google Client ID and Secret are not configured.");
  }

  const refreshed = await refreshGoogleAccessToken(sync.refresh_token, creds, fetchFn);
  const newExpiresAt = nowMs + refreshed.expiresIn * 1000;

  await db.prepare(
    "UPDATE google_sync SET access_token = ?, expires_at = ? WHERE id = 1"
  ).bind(refreshed.accessToken, newExpiresAt).run();

  return { accessToken: refreshed.accessToken, calendarId: sync.calendar_id || "primary" };
}

/** Pulls events from Google Calendar API v3 into D1 external_events */
export async function pullGoogleEvents(
  db: D1Database,
  env: Env["Bindings"],
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch
): Promise<{ syncedCount: number; deletedCount: number; lastSyncedAt: string }> {
  const auth = await getValidAccessToken(db, env, nowMs, fetchFn);
  if (!auth) throw new Error("Google Calendar is not connected.");

  // Default window: -7 days to +35 days in IST
  const dPast = new Date(nowMs - 7 * 86_400_000);
  const dFuture = new Date(nowMs + 35 * 86_400_000);
  const timeMin = toIstIso(dPast.getTime());
  const timeMax = toIstIso(dFuture.getTime());

  const url = new URL(`${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events`);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("maxResults", "250");

  const res = await fetchFn(url.toString(), {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar API error (${res.status}): ${errText}`);
  }

  const data = await res.json() as {
    items?: Array<{
      id: string;
      status?: string;
      summary?: string;
      description?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      updated?: string;
    }>;
    nextSyncToken?: string;
  };

  const items = data.items || [];
  let syncedCount = 0;
  let deletedCount = 0;
  const nowIso = toIstIso(nowMs);

  const stmts: D1PreparedStatement[] = [];

  for (const item of items) {
    if (!item.id) continue;

    if (item.status === "cancelled") {
      stmts.push(db.prepare("DELETE FROM external_events WHERE id = ?").bind(item.id));
      deletedCount++;
      continue;
    }

    const summary = item.summary?.trim() || "(Untitled Event)";
    const description = item.description || null;
    const startsAt = normalizeToIstIso(item.start?.dateTime, item.start?.date, false);
    const endsAt = normalizeToIstIso(item.end?.dateTime, item.end?.date, true);
    const isStudyBlock = /\[Command Deck\]|\[Exam Tracker\]|\[Study OS\]|CBSE|Study Block/i.test(summary) ||
                         /Command Deck|Exam Tracker & Life OS/i.test(description || "") ? 1 : 0;
    const updatedAt = item.updated ? normalizeToIstIso(item.updated) : nowIso;

    stmts.push(
      db.prepare(
        `INSERT INTO external_events (id, summary, description, starts_at, ends_at, is_study_block, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           summary = excluded.summary,
           description = excluded.description,
           starts_at = excluded.starts_at,
           ends_at = excluded.ends_at,
           is_study_block = excluded.is_study_block,
           updated_at = excluded.updated_at`
      ).bind(item.id, summary, description, startsAt, endsAt, isStudyBlock, updatedAt)
    );
    syncedCount++;
  }

  // Update last_synced_at and sync_token
  stmts.push(
    db.prepare("UPDATE google_sync SET last_synced_at = ?, sync_token = ? WHERE id = 1")
      .bind(nowIso, data.nextSyncToken || null)
  );

  if (stmts.length > 0) {
    await db.batch(stmts);
  }

  return { syncedCount, deletedCount, lastSyncedAt: nowIso };
}

/** Pushes an individual schedule block to Google Calendar API v3 */
export async function pushBlockToGoogle(
  db: D1Database,
  env: Env["Bindings"],
  block: ScheduleBlock,
  dateStr: string,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch
): Promise<{ eventId: string; htmlLink?: string }> {
  const auth = await getValidAccessToken(db, env, nowMs, fetchFn);
  if (!auth) throw new Error("Google Calendar is not connected.");

  const startIso = `${dateStr}T${block.startTime}:00+05:30`;
  const endIso = `${dateStr}T${block.endTime}:00+05:30`;
  const summary = `[Command Deck] ${block.title}`;
  const description = `Study Track: ${block.category}\nManaged by Command Deck (deck.advaitachandra.in)`;

  const payload = {
    summary,
    description,
    start: { dateTime: startIso, timeZone: "Asia/Kolkata" },
    end: { dateTime: endIso, timeZone: "Asia/Kolkata" },
    colorId: categoryToGoogleColorId(block.category),
    reminders: {
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events`;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Calendar event creation failed (${res.status}): ${errText}`);
  }

  const created = await res.json() as { id: string; htmlLink?: string };
  const nowIso = toIstIso(nowMs);

  // Save into external_events as a study block
  await db.prepare(
    `INSERT INTO external_events (id, summary, description, starts_at, ends_at, is_study_block, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, ?)
     ON CONFLICT(id) DO UPDATE SET
       summary = excluded.summary,
       description = excluded.description,
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       is_study_block = 1,
       updated_at = excluded.updated_at`
  ).bind(created.id, summary, description, startIso, endIso, nowIso).run();

  return { eventId: created.id, htmlLink: created.htmlLink };
}

/** Deletes an event from Google Calendar and the local external_events table */
export async function deleteGoogleCalendarEvent(
  db: D1Database,
  env: Env["Bindings"],
  eventId: string,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch
): Promise<{ ok: boolean }> {
  const auth = await getValidAccessToken(db, env, nowMs, fetchFn);
  if (!auth) throw new Error("Google Calendar is not connected.");

  const url = `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}`;
  await fetchFn(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  }).catch(() => null);

  await db.prepare("DELETE FROM external_events WHERE id = ?").bind(eventId).run();
  return { ok: true };
}

/** Detects schedule overlap conflicts between external events and study blocks on a given day */
export function detectScheduleConflicts(
  blocks: ScheduleBlock[],
  externalEvents: (ExternalEventRow | ExternalEvent | { startsAt?: string; starts_at?: string; endsAt?: string; ends_at?: string; isStudyBlock?: boolean; is_study_block?: number; id: string; summary: string })[],
  dateStr: string
): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  const timeToMinutes = (t: string) => {
    const [h = "0", m = "0"] = t.split(":");
    return parseInt(h, 10) * 60 + parseInt(m, 10);
  };

  const isoToMinutes = (iso: string) => {
    // "YYYY-MM-DDTHH:MM:SS+05:30"
    const match = iso.match(/T(\d{2}):(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  };

  // Filter external events that occur on dateStr and are NOT our study blocks
  const dayEvents = externalEvents.filter((e) => {
    const start = ("startsAt" in e && e.startsAt) ? e.startsAt : ("starts_at" in e ? e.starts_at : "");
    const isStudy = ("isStudyBlock" in e && typeof e.isStudyBlock === "boolean")
      ? e.isStudyBlock
      : ("is_study_block" in e && !!e.is_study_block);
    return start && start.startsWith(dateStr) && !isStudy;
  });

  for (const block of blocks) {
    const bStart = timeToMinutes(block.startTime);
    const bEnd = timeToMinutes(block.endTime);

    for (const ev of dayEvents) {
      const startIso = ("startsAt" in ev && ev.startsAt) ? ev.startsAt : (ev as any).starts_at || "";
      const endIso = ("endsAt" in ev && ev.endsAt) ? ev.endsAt : (ev as any).ends_at || "";
      const eStart = isoToMinutes(startIso);
      const eEnd = isoToMinutes(endIso);

      // Overlap condition: max(start) < min(end)
      if (Math.max(bStart, eStart) < Math.min(bEnd, eEnd)) {
        conflicts.push({
          blockId: block.id,
          blockTitle: block.title,
          blockStart: block.startTime,
          blockEnd: block.endTime,
          eventId: ev.id,
          eventSummary: ev.summary,
          eventStart: startIso,
          eventEnd: endIso,
        });
      }
    }
  }

  return conflicts;
}

/** Thrown when Google rejects the stored credentials (expired, revoked, or missing the calendar scope); the UI answers with a consent prompt. */
export class GoogleAuthError extends Error {}

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const hasCalendarScope = (scope: string | null | undefined) => (scope ?? "").split(" ").includes(CALENDAR_SCOPE);

/** True for any failure that only a fresh Google consent can fix. */
export const isAuthFailure = (err: unknown) =>
  err instanceof GoogleAuthError || /\((401|403)\)|invalid_grant|refresh failed|not connected/i.test(err instanceof Error ? err.message : "");

const STUDY_RE = /\[Command Deck\]|\[Exam Tracker\]|\[Study OS\]|CBSE|Study Block/i;

/**
 * One Google Calendar call. "{cal}" in the path becomes the selected calendar. A 401 refreshes the access
 * token once and retries; a call Google still rejects for credentials or scope throws GoogleAuthError.
 */
async function googleApi<T>(
  db: D1Database,
  env: Env["Bindings"],
  method: string,
  path: string,
  body: unknown,
  nowMs: number,
  fetchFn: typeof fetch,
  okStatuses: number[] = [],
): Promise<T | null> {
  const authed = async () => {
    try {
      const auth = await getValidAccessToken(db, env, nowMs, fetchFn);
      if (!auth) throw new GoogleAuthError("Google Calendar is not connected.");
      return auth;
    } catch (err) {
      if (err instanceof GoogleAuthError) throw err;
      throw new GoogleAuthError(err instanceof Error ? err.message : "Google token refresh failed.");
    }
  };
  const call = (auth: { accessToken: string; calendarId: string }) =>
    fetchFn(`${GOOGLE_CALENDAR_API_BASE}${path.replace("{cal}", encodeURIComponent(auth.calendarId))}`, {
      method,
      headers: { Authorization: `Bearer ${auth.accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

  let res = await call(await authed());
  if (res.status === 401) {
    await db.prepare("UPDATE google_sync SET expires_at = 0 WHERE id = 1").run();
    res = await call(await authed());
  }
  if (res.ok || okStatuses.includes(res.status)) return res.status === 204 || !res.ok ? null : ((await res.json()) as T);
  const text = await res.text();
  if (res.status === 401 || (res.status === 403 && /insufficient|scope/i.test(text))) {
    throw new GoogleAuthError(`Google rejected the calendar credentials (${res.status}). Reconnect to grant calendar access.`);
  }
  throw new Error(`Google Calendar request failed (${res.status}): ${text}`);
}

export type CalendarEventInput = { title?: string; description?: string; start?: string; end?: string; reminderMinutes?: number };

const eventBody = (e: CalendarEventInput) => ({
  ...(e.title !== undefined && { summary: e.title }),
  ...(e.description !== undefined && { description: e.description }),
  ...(e.start && { start: { dateTime: e.start, timeZone: "Asia/Kolkata" } }),
  ...(e.end && { end: { dateTime: e.end, timeZone: "Asia/Kolkata" } }),
  ...(e.reminderMinutes !== undefined && { reminders: { useDefault: false, overrides: [{ method: "popup", minutes: e.reminderMinutes }] } }),
});

type GoogleEventItem = { id: string; status?: string; summary?: string; description?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } };

/** Live read of the selected calendar between two instants (not the D1 cache). */
export async function listCalendarEvents(
  db: D1Database,
  env: Env["Bindings"],
  fromMs: number,
  toMs: number,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<{ id: string; summary: string; description: string; startsAt: string; endsAt: string; isStudyBlock: boolean }[]> {
  const q = new URLSearchParams({ timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250" });
  const data = await googleApi<{ items?: GoogleEventItem[] }>(db, env, "GET", `/calendars/{cal}/events?${q}`, null, nowMs, fetchFn);
  return (data?.items ?? [])
    .filter((i) => i.status !== "cancelled")
    .map((i) => {
      const summary = i.summary || "(no title)";
      return {
        id: i.id,
        summary,
        description: i.description || "",
        startsAt: normalizeToIstIso(i.start?.dateTime, i.start?.date),
        endsAt: normalizeToIstIso(i.end?.dateTime, i.end?.date, true),
        isStudyBlock: STUDY_RE.test(summary),
      };
    });
}

/** Creates an event and mirrors it into external_events so conflicts see it straight away. */
export async function createCalendarEvent(
  db: D1Database,
  env: Env["Bindings"],
  input: Required<Pick<CalendarEventInput, "title" | "start" | "end">> & CalendarEventInput,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<{ id: string; htmlLink?: string }> {
  const created = await googleApi<{ id: string; htmlLink?: string }>(db, env, "POST", "/calendars/{cal}/events", eventBody({ reminderMinutes: 10, ...input }), nowMs, fetchFn);
  if (!created) throw new Error("Google returned no event.");
  await db.prepare(
    `INSERT INTO external_events (id, summary, description, starts_at, ends_at, is_study_block, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at, is_study_block = excluded.is_study_block, updated_at = excluded.updated_at`,
  ).bind(created.id, input.title, input.description ?? "", input.start, input.end, STUDY_RE.test(input.title) ? 1 : 0, toIstIso(nowMs)).run();
  return created;
}

/** Patches only the fields given, then keeps the cached row in step. */
export async function updateCalendarEvent(
  db: D1Database,
  env: Env["Bindings"],
  eventId: string,
  input: CalendarEventInput,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await googleApi(db, env, "PATCH", `/calendars/{cal}/events/${encodeURIComponent(eventId)}`, eventBody(input), nowMs, fetchFn);
  await db.prepare(
    `UPDATE external_events SET summary = COALESCE(?, summary), description = COALESCE(?, description), starts_at = COALESCE(?, starts_at), ends_at = COALESCE(?, ends_at), updated_at = ? WHERE id = ?`,
  ).bind(input.title ?? null, input.description ?? null, input.start ?? null, input.end ?? null, toIstIso(nowMs), eventId).run();
}

/** Removes the event from Google (already gone counts as removed) and from the cache. Unlike deleteGoogleCalendarEvent, auth failures surface. */
export async function removeCalendarEvent(
  db: D1Database,
  env: Env["Bindings"],
  eventId: string,
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  await googleApi(db, env, "DELETE", `/calendars/{cal}/events/${encodeURIComponent(eventId)}`, null, nowMs, fetchFn, [404, 410]);
  await db.prepare("DELETE FROM external_events WHERE id = ?").bind(eventId).run();
}

/** Switches between the primary calendar and a dedicated "Command Deck" one (created on first use). Cached events belong to the old calendar, so they are cleared. */
export async function selectCalendar(
  db: D1Database,
  env: Env["Bindings"],
  target: "primary" | "deck",
  nowMs: number = Date.now(),
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  let id = "primary";
  if (target === "deck") {
    const list = await googleApi<{ items?: { id: string; summary?: string }[] }>(db, env, "GET", "/users/me/calendarList?minAccessRole=owner", null, nowMs, fetchFn);
    id = list?.items?.find((c) => c.summary === "Command Deck")?.id ?? "";
    if (!id) {
      const made = await googleApi<{ id: string }>(db, env, "POST", "/calendars", { summary: "Command Deck", timeZone: "Asia/Kolkata" }, nowMs, fetchFn);
      if (!made) throw new Error("Google returned no calendar.");
      id = made.id;
    }
  }
  await db.batch([
    db.prepare("UPDATE google_sync SET calendar_id = ?, sync_token = NULL, last_synced_at = NULL WHERE id = 1").bind(id),
    db.prepare("DELETE FROM external_events"),
    db.prepare("UPDATE deliverables SET gcal_event_id = NULL"),
    db.prepare("UPDATE schedule_blocks SET gcal_event_id = NULL, gcal_event_day = NULL"),
  ]);
  return id;
}
