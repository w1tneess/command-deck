import { describe, expect, it } from "vitest";
import type { State } from "../src/api.ts";
import { overviewStats } from "../src/overviewStats.ts";

const base = { today: "2026-10-26", heat: [], phases: [], sessions: [], subjects: [], habits: [], deliverables: [] } as unknown as State;
const heat = (...days: [string, number][]) => days.map(([day, minutes]) => ({ day, minutes }));

describe("overviewStats", () => {
  it("keeps a streak alive through an empty today, and breaks it after a missed day", () => {
    const run = heat(["2026-10-25", 30], ["2026-10-24", 30], ["2026-10-23", 30]);
    expect(overviewStats({ ...base, heat: run }).streak).toBe(3);
    expect(overviewStats({ ...base, heat: [...run, ...heat(["2026-10-26", 10])] }).streak).toBe(4);
    expect(overviewStats({ ...base, heat: heat(["2026-10-24", 30]) }).streak).toBe(0);
  });

  it("compares the last 7 days with the 7 before", () => {
    const s = overviewStats({ ...base, heat: heat(["2026-10-26", 60], ["2026-10-20", 30], ["2026-10-19", 45], ["2026-10-13", 20]) });
    expect(s.thisWeek).toBe(90); // 20 to 26 Oct
    expect(s.lastWeek).toBe(65); // 13 to 19 Oct
    expect(s.last14).toHaveLength(14);
  });

  it("lists the least-confident unmastered chapters first", () => {
    const ch = (id: string, confidence: number, status: string, passes: (string | null)[] = [null, null, null]) => ({ id, confidence, status, passes });
    const subjects = [{ id: "m", chapters: [ch("a", 4, "learning"), ch("b", 1, "mastered"), ch("c", 2, "learning", ["x", null, null]), ch("d", 2, "not_started")] }];
    const s = overviewStats({ ...base, subjects } as unknown as State);
    expect(s.weak.map((w) => w.chapter.id)).toEqual(["d", "c", "a"]);
  });
});
