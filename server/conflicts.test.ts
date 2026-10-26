import { describe, expect, it } from "vitest";
import { conflictFixes, findAvailableStudySlot } from "./calendar.ts";

const ev = (s: string, e: string) => ({ eventStart: `2026-11-02T${s}:00+05:30`, eventEnd: `2026-11-02T${e}:00+05:30` });

describe("conflictFixes", () => {
  it("moves a block by exactly the overlap-to-event-end, even past 15m", () => {
    // 15:30-17:00 revision vs tuition 16:00-17:30 -> start at 17:30, 120m later
    const r = conflictFixes({ blockStart: "15:30", blockEnd: "17:00", ...ev("16:00", "17:30") });
    expect(r.moveBy).toBe(120);
    expect(r.shorten).toEqual({ endTime: "16:00" });
  });

  it("trims the start when the event covers the start of the block", () => {
    const r = conflictFixes({ blockStart: "17:30", blockEnd: "19:30", ...ev("17:00", "18:30") });
    expect(r.shorten).toEqual({ startTime: "18:30" });
    expect(r.moveBy).toBe(60);
  });

  it("offers no move beyond the 180m the shift API accepts", () => {
    expect(conflictFixes({ blockStart: "09:00", blockEnd: "10:00", ...ev("09:00", "13:00") }).moveBy).toBeNull();
  });

  it("offers no move that would run past midnight", () => {
    expect(conflictFixes({ blockStart: "21:00", blockEnd: "23:30", ...ev("21:00", "22:30") }).moveBy).toBeNull();
  });

  it("offers no trim that leaves under 15m", () => {
    expect(conflictFixes({ blockStart: "17:00", blockEnd: "17:30", ...ev("17:10", "18:00") }).shorten).toBeNull();
  });
});

describe("findAvailableStudySlot", () => {
  it("looks outside the preferred windows before it accepts a clash", () => {
    // 15:30-17:00 and 17:30-21:30 and 07:00-08:30 all taken by an event; 14:30-15:30 is the only gap left
    const busy = [
      { startMins: 7 * 60, endMins: 8 * 60 + 45 },
      { startMins: 15 * 60 + 30, endMins: 22 * 60 },
    ];
    const slot = findAvailableStudySlot(60, busy);
    expect(slot).toEqual({ startTime: "14:30", endTime: "15:30" });
  });
});
