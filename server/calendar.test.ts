import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PIN, setup } from "./testdb.ts";

type T = Awaited<ReturnType<typeof setup>>;
let t: T;
beforeEach(async () => {
  t = await setup({ auth: "none" });
});
afterEach(() => t.dispose());

const login = (pin = PIN) =>
  t.inject({ method: "POST", url: "/api/login", payload: { pin, remember: true } });
const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0];

describe("Calendar Feed API (/api/calendar/feed.ics)", () => {
  it("fails closed (401) when neither valid token nor session cookie is provided", async () => {
    const res = await t.inject({ url: "/api/calendar/feed.ics" });
    expect(res.status).toBe(401);
    expect(await res.text()).toMatch(/Unauthorized.*token/i);
  });

  it("fails closed (401) when an invalid token is provided", async () => {
    const res = await t.inject({ url: "/api/calendar/feed.ics?token=totally-bogus-token" });
    expect(res.status).toBe(401);
  });

  it("fails closed (500) if STUDY_PASSCODE or SESSION_SECRET is unset", async () => {
    const broken = await setup({ auth: "none", pin: null });
    try {
      const res = await broken.inject({ url: "/api/calendar/feed.ics?token=xyz" });
      expect(res.status).toBe(500);
    } finally {
      await broken.dispose();
    }
  });

  it("returns 200 and valid iCalendar feed with persistent calendar_token", async () => {
    // 1. Log in to get state and retrieve calendar token
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const stateRes = await t.inject({ url: "/api/state", headers: { cookie } });
    expect(stateRes.status).toBe(200);
    const stateData = await stateRes.json();
    const calToken = stateData.calendarToken;
    expect(typeof calToken).toBe("string");
    expect(calToken.length).toBeGreaterThan(10);

    // Seed a specific subject exam slot for PB1
    await t.db.prepare("INSERT OR REPLACE INTO subject_exams (subject_id, phase_id, date) VALUES ('maths', 'pb1', '2026-11-25')").run();

    // 2. Fetch feed via token without session cookie
    const feedRes = await t.inject({ url: `/api/calendar/feed.ics?token=${calToken}` });
    expect(feedRes.status).toBe(200);
    expect(feedRes.headers.get("content-type")).toMatch(/text\/calendar/i);
    expect(feedRes.headers.get("cache-control")).toMatch(/max-age=300/i);

    const ics = await feedRes.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("X-WR-CALNAME:Command Deck (CBSE Class 10)");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Kolkata");
    expect(ics).toContain("TZID:Asia/Kolkata");

    // Must contain CBSE Class 10 exam milestone slots and phases
    expect(ics).toContain("Maths (Pre-Boards 1)");
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20261125T103000");
    expect(ics).toContain("DTEND;TZID=Asia/Kolkata:20261125T133000");
    expect(ics).toContain("CBSE Phase Milestone: Pre-Boards 1 Begins");
    expect(ics).toContain("CBSE Phase Milestone: Board Exams Begins");

    // Must contain daily routine blocks
    expect(ics).toContain("Morning Deep Work");
    expect(ics).toContain("School & Lab Sessions");
    expect(ics).toContain("RRULE:FREQ=DAILY");

    // Must contain daily targets
    expect(ics).toContain("Target: Maths");

    expect(ics).toContain("END:VCALENDAR");
  });

  it("allows access with valid session cookie even without query token", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const feedRes = await t.inject({ url: "/api/calendar/feed.ics", headers: { cookie } });
    expect(feedRes.status).toBe(200);
    const ics = await feedRes.text();
    expect(ics).toContain("BEGIN:VCALENDAR");
  });

  it("supports resetting the calendar token securely", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    const tokenRes1 = await t.inject({ url: "/api/calendar/token", headers: { cookie } });
    expect(tokenRes1.status).toBe(200);
    const { token: t1 } = await tokenRes1.json();

    const resetRes = await t.inject({ method: "POST", url: "/api/calendar/token/reset", headers: { cookie } });
    expect(resetRes.status).toBe(200);
    const { token: t2 } = await resetRes.json();
    expect(t2).not.toBe(t1);

    // Old token should be rejected
    const oldFeed = await t.inject({ url: `/api/calendar/feed.ics?token=${t1}` });
    expect(oldFeed.status).toBe(401);

    // New token works
    const newFeed = await t.inject({ url: `/api/calendar/feed.ics?token=${t2}` });
    expect(newFeed.status).toBe(200);
  });

  it("schedules daily targets avoiding school hours (08:45-14:30) and external tuition", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const tokenRes = await t.inject({ url: "/api/calendar/token", headers: { cookie } });
    const { token } = await tokenRes.json();

    // Insert an external tuition event at 15:30 - 17:00 (afternoon slot)
    await t.db.prepare(
      "INSERT INTO external_events (id, summary, starts_at, ends_at, is_study_block, updated_at) VALUES ('tut-1', 'Maths Tuition Class', '2026-10-24T15:30:00+05:30', '2026-10-24T17:00:00+05:30', 0, '2026-10-24T15:00:00Z')"
    ).run();

    // Insert a daily target for today
    await t.db.prepare(
      "INSERT INTO daily_targets (day, title, done, duration) VALUES ('2026-10-24', 'Physics Optics Revision', 0, '1h 00m')"
    ).run();

    const feedRes = await t.inject({ url: `/api/calendar/feed.ics?token=${token}` });
    expect(feedRes.status).toBe(200);
    const ics = await feedRes.text();

    // Target must NOT be scheduled during school hours (08:45 - 14:30)
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T09");
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T10");
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T11");
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T12");
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T13");

    // Target must NOT conflict with the 15:30 tuition class
    expect(ics).not.toContain("DTSTART;TZID=Asia/Kolkata:20261024T153000");

    // Must be placed in an available evening slot (e.g. 17:30)
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20261024T173000");
    expect(ics).toContain("Target: Physics Optics Revision");
  });

  it("schedules school deliverables for 08:00 morning handover before school at 08:45", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const tokenRes = await t.inject({ url: "/api/calendar/token", headers: { cookie } });
    const { token } = await tokenRes.json();

    // Insert a deliverable due on 2026-10-28
    await t.db.prepare(
      "INSERT INTO deliverables (name, subject, detail, due, status, phase_id) VALUES ('Physics practicals', 'Science', 'lab manual submission', '2026-10-28', 'not_started', 'pb1')"
    ).run();

    const feedRes = await t.inject({ url: `/api/calendar/feed.ics?token=${token}` });
    expect(feedRes.status).toBe(200);
    const ics = await feedRes.text();

    // Must start at 08:00 AM IST before school
    expect(ics).toContain("DTSTART;TZID=Asia/Kolkata:20261028T080000");
    expect(ics).toContain("DTEND;TZID=Asia/Kolkata:20261028T083000");
    expect(ics).toContain("Due: Physics practicals (Science)");
  });
});

describe("Schedule Blocks & Delay Shifting API", () => {
  it("initializes default schedule tracks in state", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);
    const stateRes = await t.inject({ url: "/api/state", headers: { cookie } });
    const { scheduleBlocks } = await stateRes.json();
    expect(Array.isArray(scheduleBlocks)).toBe(true);
    expect(scheduleBlocks.length).toBe(5);
    expect(scheduleBlocks[0].title).toBe("Morning Deep Work");
  });

  it("shifts schedule blocks forward and backward (+15m / -15m)", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    // Shift +15 minutes
    const shiftRes = await t.inject({
      method: "POST",
      url: "/api/schedule/shift",
      payload: { deltaMins: 15 },
      headers: { cookie },
    });
    expect(shiftRes.status).toBe(200);

    const state1 = await (await t.inject({ url: "/api/state", headers: { cookie } })).json();
    expect(state1.scheduleBlocks[0].startTime).toBe("07:15");
    expect(state1.scheduleBlocks[0].endTime).toBe("08:45");

    // Shift -15 minutes back
    const shiftBackRes = await t.inject({
      method: "POST",
      url: "/api/schedule/shift",
      payload: { deltaMins: -15 },
      headers: { cookie },
    });
    expect(shiftBackRes.status).toBe(200);

    const state2 = await (await t.inject({ url: "/api/state", headers: { cookie } })).json();
    expect(state2.scheduleBlocks[0].startTime).toBe("07:00");
    expect(state2.scheduleBlocks[0].endTime).toBe("08:30");
  });

  it("resets schedule blocks to default baseline", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    // Shift first
    await t.inject({
      method: "POST",
      url: "/api/schedule/shift",
      payload: { deltaMins: 30 },
      headers: { cookie },
    });

    // Reset
    const resetRes = await t.inject({
      method: "POST",
      url: "/api/schedule/reset",
      headers: { cookie },
    });
    expect(resetRes.status).toBe(200);

    const stateRes = await (await t.inject({ url: "/api/state", headers: { cookie } })).json();
    expect(stateRes.scheduleBlocks[0].startTime).toBe("07:00");
  });

  it("allows updating an individual schedule block via PATCH", async () => {
    const logRes = await login();
    const cookie = cookieOf(logRes);

    const stateRes = await t.inject({ url: "/api/state", headers: { cookie } });
    const { scheduleBlocks } = await stateRes.json();
    const firstId = scheduleBlocks[0].id;

    const patchRes = await t.inject({
      method: "PATCH",
      url: `/api/schedule/blocks/${firstId}`,
      payload: { title: "Early Morning Physics Drill", startTime: "05:30", endTime: "08:00" },
      headers: { cookie },
    });
    expect(patchRes.status).toBe(200);

    const stateAfter = await (await t.inject({ url: "/api/state", headers: { cookie } })).json();
    const updated = stateAfter.scheduleBlocks.find((b: any) => b.id === firstId);
    expect(updated.title).toBe("Early Morning Physics Drill");
    expect(updated.startTime).toBe("05:30");
  });
});
