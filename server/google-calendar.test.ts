import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setup } from "./testdb.ts";
import {
  buildGoogleAuthUrl,
  categoryToGoogleColorId,
  detectScheduleConflicts,
  exchangeGoogleAuthCode,
  hasCalendarScope,
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

/** A valid session cookie wrapped in a Response, so tests can keep using cookieOf(). */
const login = async () => new Response(null, { headers: { "set-cookie": await t.mintCookie() } });
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
    expect(u.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar");
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
  it("calendar feed never accepts a password-like value as a URL credential", async () => {
    for (const q of ["token", "passcode", "key"]) {
      expect((await t.inject({ url: `/api/calendar/feed.ics?${q}=correct-horse-battery` })).status).toBe(401);
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

describe("Full-access calendar API", () => {
  const seed = async (scope: string | null = "https://www.googleapis.com/auth/calendar") => {
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', 'id'), ('google_client_secret', 'secret')").run();
    await t.db.prepare("INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id, scope) VALUES (1, 'ref', 'tok', 9999999999999, 'primary', ?)").bind(scope).run();
    return cookieOf(await login());
  };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const call = (cookie: string, method: string, url: string, payload?: unknown) => t.inject({ method, url, payload, headers: { cookie } });

  it("asks for the full calendar scope and flags connections that predate it", async () => {
    expect(hasCalendarScope("https://www.googleapis.com/auth/calendar.events")).toBe(false);
    expect(hasCalendarScope("openid https://www.googleapis.com/auth/calendar")).toBe(true);
    const url = new URL(buildGoogleAuthUrl({ clientId: "id", clientSecret: "s", redirectUri: "https://x/cb" }, "st"));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar");
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");

    const cookie = await seed(null);
    expect(((await (await call(cookie, "GET", "/api/google/status")).json()) as any).needsReauth).toBe(true);
    await t.db.prepare("UPDATE google_sync SET scope = 'https://www.googleapis.com/auth/calendar'").run();
    expect(((await (await call(cookie, "GET", "/api/google/status")).json()) as any).needsReauth).toBe(false);
  });

  it("validates event input before touching Google", async () => {
    const cookie = await seed();
    vi.stubGlobal("fetch", async () => { throw new Error("must not call Google"); });
    try {
      expect((await call(cookie, "POST", "/api/calendar/events", { title: "x" })).status).toBe(400);
      expect((await call(cookie, "POST", "/api/calendar/events", { title: "x", start: "2026-10-26T10:00:00+05:30", end: "2026-10-26T09:00:00+05:30" })).status).toBe(400);
      expect((await call(cookie, "PATCH", "/api/calendar/events/abc", {})).status).toBe(400);
      expect((await call(cookie, "PUT", "/api/calendar/settings", { twoWay: "yes" })).status).toBe(400);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("creates, lists, updates and deletes events, keeping the cache in step", async () => {
    const cookie = await seed();
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      seen.push(`${init?.method ?? "GET"} ${new URL(url).pathname}`);
      if (init?.method === "POST") return json({ id: "ev1", htmlLink: "https://cal/ev1" });
      if (init?.method === "PATCH") return json({ id: "ev1" });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return json({ items: [{ id: "ev1", summary: "[Command Deck] Maths", start: { dateTime: "2026-10-26T10:00:00+05:30" }, end: { dateTime: "2026-10-26T11:00:00+05:30" } }, { id: "gone", status: "cancelled" }] });
    });
    try {
      const made = await call(cookie, "POST", "/api/calendar/events", { title: "[Command Deck] Maths", start: "2026-10-26T10:00:00+05:30", end: "2026-10-26T11:00:00+05:30" });
      expect(((await made.json()) as any).id).toBe("ev1");
      expect((await t.db.prepare("SELECT is_study_block AS s FROM external_events WHERE id = 'ev1'").first<{ s: number }>())?.s).toBe(1);

      const list = (await (await call(cookie, "GET", "/api/calendar/events?range=month")).json()) as any;
      expect(list.range).toBe("month");
      expect(list.events.map((e: any) => e.id)).toEqual(["ev1"]);

      expect((await call(cookie, "PATCH", "/api/calendar/events/ev1", { start: "2026-10-26T12:00:00+05:30", end: "2026-10-26T13:00:00+05:30" })).status).toBe(200);
      expect((await t.db.prepare("SELECT starts_at AS s FROM external_events WHERE id = 'ev1'").first<{ s: string }>())?.s).toBe("2026-10-26T12:00:00+05:30");

      expect((await call(cookie, "DELETE", "/api/calendar/events/ev1")).status).toBe(200);
      expect((await t.db.prepare("SELECT COUNT(*) AS c FROM external_events").first<{ c: number }>())?.c).toBe(0);
      expect(seen).toContain("PATCH /calendar/v3/calendars/primary/events/ev1");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("refreshes once on 401, and answers 403 with reauth when Google keeps refusing", async () => {
    const cookie = await seed();
    let eventCalls = 0;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com")) return json({ access_token: "fresh", expires_in: 3600 });
      eventCalls++;
      return eventCalls === 1 ? new Response("expired", { status: 401 }) : json({ items: [] });
    });
    try {
      expect((await call(cookie, "GET", "/api/calendar/events")).status).toBe(200);
      expect(eventCalls).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
    vi.stubGlobal("fetch", async () => json({ error: { message: "Request had insufficient authentication scopes." } }, 403));
    try {
      const res = await call(cookie, "GET", "/api/calendar/events");
      expect(res.status).toBe(403);
      expect(((await res.json()) as any).reauth).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("switches to a dedicated Command Deck calendar and honours the two-way switch", async () => {
    const cookie = await seed();
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return json({ id: "deck@group.calendar.google.com" });
      return json({ items: [{ id: "primary-id", summary: "Me" }] });
    });
    try {
      expect((await call(cookie, "POST", "/api/calendar/target", { target: "nope" })).status).toBe(400);
      expect((await call(cookie, "POST", "/api/calendar/target", { target: "deck" })).status).toBe(200);
      const status = (await (await call(cookie, "GET", "/api/google/status")).json()) as any;
      expect(status.calendarTarget).toBe("deck");

      expect((await call(cookie, "PUT", "/api/calendar/settings", { twoWay: false })).status).toBe(200);
      const sync = (await (await call(cookie, "POST", "/api/google/sync")).json()) as any;
      expect(sync.skipped).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Pushed events stay linked", () => {
  const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const connect = async () => {
    await t.db.prepare("INSERT INTO settings (key, value) VALUES ('google_client_id', 'id'), ('google_client_secret', 'secret')").run();
    await t.db.prepare("INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id, scope) VALUES (1, 'ref', 'tok', 9999999999999, 'primary', 'https://www.googleapis.com/auth/calendar')").run();
    return cookieOf(await login());
  };
  const send = (cookie: string, method: string, url: string, payload?: unknown) => t.inject({ method, url, payload, headers: { cookie } });
  const EV = { title: "[Command Deck] Lab file", start: "2026-11-01T16:00:00+05:30", end: "2026-11-01T17:00:00+05:30" };

  it("a deliverable's second push updates its event instead of adding another", async () => {
    const cookie = await connect();
    await t.db.prepare("INSERT INTO deliverables (id, name, subject, detail, due) VALUES (900, 'Lab file', 'Science', '', '2026-11-01')").run();
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (_u: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return init?.method === "POST" ? J({ id: "ev-900" }) : J({ id: "ev-900" });
    });
    try {
      expect(((await (await send(cookie, "POST", "/api/calendar/events", { ...EV, deliverableId: 900 })).json()) as any).id).toBe("ev-900");
      const link = () => t.db.prepare("SELECT gcal_event_id AS id FROM deliverables WHERE id = 900").first<{ id: string | null }>();
      expect((await link())?.id).toBe("ev-900");
      const state = (await (await send(cookie, "GET", "/api/state")).json()) as any;
      expect(state.deliverables.find((d: any) => d.id === 900).gcalEventId).toBe("ev-900");

      // pushing again (e.g. after a reload) patches the same event
      const again = (await (await send(cookie, "POST", "/api/calendar/events", { ...EV, deliverableId: 900 })).json()) as any;
      expect(again.updated).toBe(true);
      expect(calls.filter((m) => m === "POST")).toHaveLength(1);

      // deleting it in Google through us clears the link
      expect((await send(cookie, "DELETE", "/api/calendar/events/ev-900")).status).toBe(200);
      expect((await link())?.id).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("forgets the link when Google no longer has the event, so the next push recreates it", async () => {
    const cookie = await connect();
    await t.db.prepare("INSERT INTO deliverables (id, name, subject, detail, due, gcal_event_id) VALUES (901, 'Poster', 'SST', '', '2026-11-02', 'gone')").run();
    vi.stubGlobal("fetch", async () => new Response("not found", { status: 404 }));
    try {
      const res = await send(cookie, "PATCH", "/api/calendar/events/gone", { title: "[Command Deck] Poster" });
      expect(res.status).toBe(404);
      expect((await t.db.prepare("SELECT gcal_event_id AS id FROM deliverables WHERE id = 901").first<{ id: string | null }>())?.id).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("a block pushed twice on one day is one event; a new day gets a new one", async () => {
    const cookie = await connect();
    const blocks = ((await (await send(cookie, "GET", "/api/state")).json()) as any).scheduleBlocks;
    const id = blocks[0].id;
    const calls: string[] = [];
    let n = 0;
    vi.stubGlobal("fetch", async (_u: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init?.method ?? "GET");
      return J({ id: init?.method === "POST" ? `blk-${++n}` : "ok" });
    });
    try {
      await send(cookie, "POST", "/api/google/push", { blockId: id, date: "2026-11-03" });
      await send(cookie, "POST", "/api/google/push", { blockId: id, date: "2026-11-03" });
      expect(calls).toEqual(["POST", "PATCH"]);
      const row = await t.db.prepare("SELECT gcal_event_id AS e, gcal_event_day AS d FROM schedule_blocks WHERE id = ?").bind(id).first<{ e: string; d: string }>();
      expect(row).toEqual({ e: "blk-1", d: "2026-11-03" });

      await send(cookie, "POST", "/api/google/push", { blockId: id, date: "2026-11-04" });
      expect((await t.db.prepare("SELECT gcal_event_id AS e FROM schedule_blocks WHERE id = ?").bind(id).first<{ e: string }>())?.e).toBe("blk-2");

      // moving to the dedicated calendar orphans every link
      await send(cookie, "POST", "/api/calendar/target", { target: "deck" });
      expect((await t.db.prepare("SELECT gcal_event_id AS e FROM schedule_blocks WHERE id = ?").bind(id).first<{ e: string | null }>())?.e).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Pull and delete", () => {
  const nowMs = Date.parse("2026-10-24T06:00:00Z");
  const seedSync = () => t.db.prepare("INSERT INTO google_sync (id, refresh_token, access_token, expires_at, calendar_id) VALUES (1, 'ref', 'tok', 9999999999999, 'primary')").run();
  const cache = (id: string, startsAt: string) =>
    t.db.prepare("INSERT INTO external_events (id, summary, starts_at, ends_at, updated_at) VALUES (?, ?, ?, ?, ?)").bind(id, id, startsAt, startsAt, startsAt).run();
  const ids = async () => (await t.db.prepare("SELECT id FROM external_events ORDER BY id").all<{ id: string }>()).results.map((r) => r.id);
  const event = (id: string) => ({ id, summary: id, start: { dateTime: "2026-10-26T04:00:00Z" }, end: { dateTime: "2026-10-26T05:00:00Z" } });
  const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("follows nextPageToken and drops cached events in the window that Google no longer returns", async () => {
    await seedSync();
    await cache("gone", "2026-10-25T10:00:00+05:30");
    await cache("ancient", "2026-01-01T10:00:00+05:30"); // outside the window: left alone
    const mockFetch = async (input: RequestInfo | URL) =>
      new URL(String(input)).searchParams.get("pageToken") === "p2" ? reply({ items: [event("b")] }) : reply({ items: [event("a")], nextPageToken: "p2" });
    const res = await pullGoogleEvents(t.db, {}, nowMs, mockFetch as any);
    expect(res).toMatchObject({ syncedCount: 2, deletedCount: 1 });
    expect(await ids()).toEqual(["a", "ancient", "b"]);
  });

  it("keeps cached events when the page cap cuts the list short", async () => {
    await seedSync();
    await cache("maybe-later", "2026-10-25T10:00:00+05:30");
    let calls = 0;
    const mockFetch = async () => reply({ items: [event(`p${calls++}`)], nextPageToken: "more" });
    await pullGoogleEvents(t.db, {}, nowMs, mockFetch as any);
    expect(calls).toBe(10);
    expect(await ids()).toContain("maybe-later");
  });

  it("DELETE /api/google/events/:id reports a Google failure and keeps the cached event", async () => {
    await seedSync();
    await cache("ev1", "2026-10-25T10:00:00+05:30");
    const cookie = cookieOf(await login());
    vi.stubGlobal("fetch", async () => new Response("boom", { status: 500 }));
    try {
      const res = await t.inject({ method: "DELETE", url: "/api/google/events/ev1", headers: { cookie } });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(await ids()).toEqual(["ev1"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
