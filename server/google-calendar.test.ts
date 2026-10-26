import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD, setup } from "./testdb.ts";
import {
  buildGoogleAuthUrl,
  categoryToGoogleColorId,
  detectScheduleConflicts,
  exchangeGoogleAuthCode,
  normalizeToIstIso,
  pullGoogleEvents,
  pushBlockToGoogle,
  refreshGoogleAccessToken,
  toIstIso,
} from "./google-calendar.ts";
import type { ScheduleBlock } from "./calendar.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;

beforeEach(async () => {
  t = await setup({ auth: "none" });
});
afterEach(() => t.dispose());

/** Signs in through the real email flow and wraps the cookie in a Response, so tests can keep using cookieOf(). */
const login = async () => new Response(null, { headers: { "set-cookie": await t.signIn() } });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe("Google Calendar Pure Utilities", () => {
  it("maps categories to valid Google Calendar color IDs", () => {
    expect(categoryToGoogleColorId("morning")).toBe("7");
    expect(categoryToGoogleColorId("school")).toBe("5");
    expect(categoryToGoogleColorId("revision")).toBe("9");
    expect(categoryToGoogleColorId("practice")).toBe("3");
    expect(categoryToGoogleColorId("winddown")).toBe("4");
    expect(categoryToGoogleColorId("custom")).toBe("2");
  });

  it("formats epoch ms into strict IST (+05:30) ISO format", () => {
    // 2026-10-24 09:00:00 UTC = 2026-10-24 14:30:00 IST
    const epochMs = Date.parse("2026-10-24T09:00:00Z");
    const ist = toIstIso(epochMs);
    expect(ist).toBe("2026-10-24T14:30:00+05:30");
  });

  it("normalizes dateTime and all-day date strings to IST ISO", () => {
    const fromUtc = normalizeToIstIso("2026-10-24T10:00:00Z");
    expect(fromUtc).toBe("2026-10-24T15:30:00+05:30");

    const allDayStart = normalizeToIstIso(null, "2026-10-24", false);
    expect(allDayStart).toBe("2026-10-24T00:00:00+05:30");

    const allDayEnd = normalizeToIstIso(null, "2026-10-24", true);
    expect(allDayEnd).toBe("2026-10-24T23:59:59+05:30");
  });

  it("constructs correct Google OAuth 2.0 URL with required scopes", () => {
    const creds = {
      clientId: "test-client-id.apps.googleusercontent.com",
      clientSecret: "test-secret",
      redirectUri: "https://deck.advaitachandra.in/api/google/callback",
    };
    const urlStr = buildGoogleAuthUrl(creds, "xyz-state-token");
    const u = new URL(urlStr);
    expect(u.origin).toBe("https://accounts.google.com");
    expect(u.pathname).toBe("/o/oauth2/v2/auth");
    expect(u.searchParams.get("client_id")).toBe(creds.clientId);
    expect(u.searchParams.get("redirect_uri")).toBe(creds.redirectUri);
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    expect(u.searchParams.get("state")).toBe("xyz-state-token");
    expect(u.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events");
  });

  it("detects schedule overlap conflicts between external events and study blocks", () => {
    const blocks: ScheduleBlock[] = [
      { id: 1, title: "Morning Deep Work", category: "morning", startTime: "07:00", endTime: "08:30", color: "#38bdf8", pos: 1 },
      { id: 2, title: "School & Lab Sessions", category: "school", startTime: "08:45", endTime: "14:30", color: "#f59e0b", pos: 2 },
      { id: 3, title: "Afternoon Revision", category: "revision", startTime: "15:30", endTime: "17:00", color: "#818cf8", pos: 3 },
    ];

    const externalEvents = [
      // Overlaps with block 3 (16:00 - 17:30 overlaps with 15:30 - 17:00)
      {
        id: "ev1",
        summary: "Dentist Appointment",
        description: null,
        startsAt: "2026-10-24T16:00:00+05:30",
        endsAt: "2026-10-24T17:30:00+05:30",
        isStudyBlock: false,
        updatedAt: "2026-10-24T10:00:00+05:30",
      },
      // Non-overlapping event (20:00 - 21:00)
      {
        id: "ev2",
        summary: "Family Dinner",
        description: null,
        startsAt: "2026-10-24T20:00:00+05:30",
        endsAt: "2026-10-24T21:00:00+05:30",
        isStudyBlock: false,
        updatedAt: "2026-10-24T10:00:00+05:30",
      },
      // Study block created by Exam Tracker (should not count as a conflict)
      {
        id: "ev3",
        summary: "[Exam Tracker] Morning Deep Work",
        description: null,
        startsAt: "2026-10-24T07:00:00+05:30",
        endsAt: "2026-10-24T08:30:00+05:30",
        isStudyBlock: true,
        updatedAt: "2026-10-24T07:00:00+05:30",
      },
    ];

    const conflicts = detectScheduleConflicts(blocks, externalEvents, "2026-10-24");
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].blockId).toBe(3);
    expect(conflicts[0].blockTitle).toBe("Afternoon Revision");
    expect(conflicts[0].eventId).toBe("ev1");
    expect(conflicts[0].eventSummary).toBe("Dentist Appointment");
  });
});

describe("Google Calendar Two-Way Live Sync Endpoints", () => {
  it("GET /api/google/status reports disconnected when no sync row exists", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    const res = await t.inject({ url: "/api/google/status", headers: { cookie } });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.connected).toBe(false);
    expect(data.eventCount).toBe(0);
  });

  it("POST /api/google/setup saves credentials and refresh token", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    const setupRes = await t.inject({
      method: "POST",
      url: "/api/google/setup",
      payload: {
        clientId: "client-123.apps.googleusercontent.com",
        clientSecret: "secret-xyz",
        refreshToken: "refresh-token-456",
        calendarId: "primary",
      },
      headers: { cookie },
    });

    expect(setupRes.status).toBe(200);

    const statusRes = await t.inject({ url: "/api/google/status", headers: { cookie } });
    const statusData = await statusRes.json() as any;
    expect(statusData.connected).toBe(true);
    expect(statusData.hasCredentials).toBe(true);
    expect(statusData.calendarId).toBe("primary");
  });

  it("GET /api/google/auth/url fails when client ID is missing and succeeds when configured", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    // Initial check without credentials
    const errRes = await t.inject({ url: "/api/google/auth/url", headers: { cookie } });
    expect(errRes.status).toBe(400);

    // Configure credentials in settings
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', 'my-client-id')").run();
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_secret', 'my-client-secret')").run();

    const okRes = await t.inject({ url: "/api/google/auth/url", headers: { cookie } });
    expect(okRes.status).toBe(200);
    const data = await okRes.json() as any;
    expect(data.url).toContain("accounts.google.com");
    expect(data.url).toContain("my-client-id");
    const parsedUrl = new URL(data.url);
    expect(parsedUrl.searchParams.get("redirect_uri")).toContain("/api/google/callback");
    expect(parsedUrl.searchParams.get("redirect_uri")).not.toContain("/api/auth/google/callback");
  });

  it("POST /api/google/sync pulls events with mock fetch and updates external_events", async () => {
    // 1. Seed credentials and active tokens
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', 'my-client-id')").run();
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_secret', 'my-client-secret')").run();
    await t.db.prepare(
      "INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id) VALUES (1, 'ref-token', 'mock-access-token', 9999999999999, 'primary')"
    ).run();

    // Mock fetch for Google Calendar API
    const mockEventsResponse = {
      items: [
        {
          id: "gcal-event-1",
          summary: "Physics Lab Session",
          description: "Experiment 4 viva prep",
          start: { dateTime: "2026-10-24T09:00:00Z" }, // 14:30 IST
          end: { dateTime: "2026-10-24T10:30:00Z" },   // 16:00 IST
          updated: "2026-10-24T08:00:00Z",
        },
        {
          id: "gcal-event-2",
          summary: "[Exam Tracker] Morning Deep Work",
          description: "Study Block: morning",
          start: { dateTime: "2026-10-24T01:30:00Z" }, // 07:00 IST
          end: { dateTime: "2026-10-24T03:00:00Z" },   // 08:30 IST
          updated: "2026-10-24T01:00:00Z",
        },
      ],
      nextSyncToken: "sync-token-next",
    };

    const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url.includes("/events")) {
        return new Response(JSON.stringify(mockEventsResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    // Execute pull using mock fetch
    const nowMs = Date.parse("2026-10-24T06:00:00Z");
    const pullRes = await pullGoogleEvents(t.db, {}, nowMs, mockFetch as any);
    expect(pullRes.syncedCount).toBe(2);

    // Verify events were stored in external_events
    const rows = (await t.db.prepare("SELECT * FROM external_events ORDER BY id").all<any>()).results;
    expect(rows.length).toBe(2);
    expect(rows[0].id).toBe("gcal-event-1");
    expect(rows[0].summary).toBe("Physics Lab Session");
    expect(rows[0].is_study_block).toBe(0);
    expect(rows[0].starts_at).toBe("2026-10-24T14:30:00+05:30");

    expect(rows[1].id).toBe("gcal-event-2");
    expect(rows[1].is_study_block).toBe(1);

    // Verify /api/state returns externalEvents and googleSync for today
    t.setNow(nowMs);
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const stateRes = await t.inject({ url: "/api/state", headers: { cookie } });
    expect(stateRes.status).toBe(200);
    const stateData = await stateRes.json() as any;
    expect(stateData.googleSync.connected).toBe(true);
    expect(stateData.externalEvents.length).toBe(2);
  });

  it("POST /api/google/disconnect clears sync and external events", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    await t.db.prepare("INSERT INTO google_sync (id, refresh_token) VALUES (1, 'ref')").run();
    await t.db.prepare("INSERT INTO external_events (id, summary, starts_at, ends_at, updated_at) VALUES ('e1', 'Test', '2026-10-24T10:00:00+05:30', '2026-10-24T11:00:00+05:30', '2026-10-24T10:00:00+05:30')").run();

    const discRes = await t.inject({ method: "POST", url: "/api/google/disconnect", headers: { cookie } });
    expect(discRes.status).toBe(200);

    const syncCount = (await t.db.prepare("SELECT COUNT(*) AS c FROM google_sync").first<{ c: number }>())?.c;
    const eventCount = (await t.db.prepare("SELECT COUNT(*) AS c FROM external_events").first<{ c: number }>())?.c;
    expect(syncCount).toBe(0);
    expect(eventCount).toBe(0);
  });
});

describe("security hardening", () => {
  it("calendar feed never accepts the password as a URL credential", async () => {
    for (const q of ["token", "passcode", "key"]) {
      expect((await t.inject({ url: `/api/calendar/feed.ics?${q}=${PASSWORD}` })).status).toBe(401);
    }
  });

  it("backups never contain Google OAuth tokens", async () => {
    const cookie = cookieOf(await login());
    await t.db.prepare("INSERT INTO google_sync (id, refresh_token, access_token) VALUES (1, 'secret-refresh', 'secret-access')").run();
    const text = await (await t.inject({ url: "/api/export", headers: { cookie } })).text();
    expect(text).not.toContain("secret-refresh");
    expect(text).not.toContain("google_sync");
  });

  it("calendar OAuth state is cookie-bound, expiring and single-use", async () => {
    const cookie = cookieOf(await login());
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', 'id')").run();
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_secret', 'secret')").run();
    const start = async () => {
      const res = await t.inject({ url: "/api/google/auth/url", headers: { cookie } });
      const state = new URL(((await res.json()) as any).url).searchParams.get("state")!;
      return { state, stateCookie: cookieOf(res) };
    };
    const callback = async (state: string, headers: Record<string, string> = {}) =>
      (await t.inject({ url: `/api/google/callback?code=c&state=${state}`, headers })).headers.get("location") ?? "";
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    try {
      const a = await start();
      expect(await callback("forged", { cookie: a.stateCookie })).toContain("state_mismatch");
      expect(await callback(a.state, { cookie: a.stateCookie })).not.toContain("state_mismatch");
      // single-use: the localhost D1 fallback row was consumed above, so a cookie-less replay is refused
      expect(await callback(a.state)).toContain("state_mismatch");
      // an expired localhost fallback row is refused
      const b = await start();
      await t.db.prepare("UPDATE settings SET value = ? WHERE key = 'google_oauth_state'").bind(`${b.state}:1`).run();
      expect(await callback(b.state)).toContain("state_mismatch");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
