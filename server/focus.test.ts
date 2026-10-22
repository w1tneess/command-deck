import { describe, expect, it } from "vitest";
import { BREAK_S, FOCUS_S, IDLE, LONG_BREAK_S, settleTimer, startFocus, stopTimer, type Timer } from "./timer.ts";
import { studyQueue, type QueueChapter } from "./planner.ts";

const MIN = 60_000;
const T0 = Date.parse("2026-10-22T06:00:00Z"); // 11:30 IST
const running = (over: Partial<Timer> = {}): Timer => ({ mode: "focus", subjectId: "maths", startedAt: T0, durationS: FOCUS_S, round: 0, cycleDay: "2026-10-22", ...over });

describe("settleTimer", () => {
  it("leaves a running focus alone", () => {
    const r = settleTimer(running(), T0 + 24 * MIN);
    expect(r.logs).toEqual([]);
    expect(r.timer.mode).toBe("focus");
  });

  it("logs a finished focus in full and starts the break from the moment it ended", () => {
    const r = settleTimer(running(), T0 + 26 * MIN);
    expect(r.logs).toEqual([{ subjectId: "maths", day: "2026-10-22", minutes: 25 }]);
    expect(r.timer).toMatchObject({ mode: "break", startedAt: T0 + 25 * MIN, durationS: BREAK_S, round: 1 });
  });

  it("goes idle when the break is over too, and logs only once however late it is", () => {
    const r = settleTimer(running(), T0 + 5 * 60 * MIN);
    expect(r.logs).toHaveLength(1);
    expect(r.timer).toMatchObject({ mode: "idle", startedAt: null, round: 1, subjectId: "maths" });
  });

  it("takes a long break after the 4th round and starts the cycle again", () => {
    const r = settleTimer(running({ round: 3 }), T0 + 26 * MIN);
    expect(r.timer).toMatchObject({ mode: "long_break", durationS: LONG_BREAK_S, round: 0 });
  });

  it("does nothing while idle", () => {
    expect(settleTimer(IDLE, T0)).toEqual({ timer: IDLE, logs: [] });
  });

  it("logs against the day the focus ended, across IST midnight", () => {
    const start = Date.parse("2026-10-22T18:20:00Z"); // 23:50 IST
    const r = settleTimer(running({ startedAt: start }), start + 26 * MIN);
    expect(r.logs[0].day).toBe("2026-10-23");
  });
});

describe("stopTimer", () => {
  it("logs whole minutes so far when a focus is stopped early", () => {
    const r = stopTimer(running(), T0 + 10 * MIN + 40_000);
    expect(r.logs).toEqual([{ subjectId: "maths", day: "2026-10-22", minutes: 10 }]);
    expect(r.timer).toMatchObject({ mode: "idle", round: 0 }); // an early stop is not a finished round
  });

  it("logs nothing under a minute, and nothing when stopping a break", () => {
    expect(stopTimer(running(), T0 + 59_000).logs).toEqual([]);
    expect(stopTimer(running({ mode: "break", durationS: BREAK_S }), T0 + 2 * MIN).logs).toEqual([]);
  });
});

describe("startFocus", () => {
  it("refuses while a focus is running, and replaces a break", () => {
    expect(startFocus(running(), "maths", T0)).toBeNull();
    expect(startFocus(running({ mode: "break", durationS: BREAK_S }), "physics", T0)).toMatchObject({ mode: "focus", subjectId: "physics" });
  });

  it("continues the round count on the same day and resets it on a new day", () => {
    const idle = { ...IDLE, round: 2, cycleDay: "2026-10-22" };
    expect(startFocus(idle, "maths", T0)?.round).toBe(2);
    expect(startFocus(idle, "maths", T0 + 24 * 60 * MIN)?.round).toBe(0);
  });
});

describe("studyQueue", () => {
  const phase = { id: "pb1", startsOn: "2026-11-19", endsOn: "2026-12-02", scope: "pb1" as const };
  const ch = (id: string, over: Partial<QueueChapter> = {}): QueueChapter => ({
    chapterId: id, subjectId: "maths", priority: 1, confidence: 1, lastRevised: null, status: "not_started", scope: "unit1", examDate: null, ...over,
  });
  const ids = (xs: { chapterId: string }[]) => xs.map((x) => x.chapterId);

  it("skips mastered chapters and chapters outside the phase scope", () => {
    const q = studyQueue([ch("a"), ch("done", { status: "mastered" }), ch("later", { scope: "board" })], phase, "2026-10-22", null, 5);
    expect(ids(q)).toEqual(["a"]);
  });

  it("low energy puts lighter chapters first, keeping rank order inside each group", () => {
    const chapters = [ch("hard", { confidence: 1 }), ch("mid", { confidence: 3 }), ch("revised", { confidence: 2, status: "revised" }), ch("hard2", { confidence: 2 })];
    expect(ids(studyQueue(chapters, phase, "2026-10-22", "low", 4))).toEqual(["revised", "mid", "hard", "hard2"]);
  });

  it("high energy puts the hardest chapter first", () => {
    const chapters = [ch("easy", { confidence: 4 }), ch("hard", { confidence: 1 }), ch("mid", { confidence: 3 })];
    expect(ids(studyQueue(chapters, phase, "2026-10-22", "high", 3))).toEqual(["hard", "mid", "easy"]);
  });

  it("ok leaves the date-aware order, and exclude skips planned chapters", () => {
    const chapters = [ch("far", { confidence: 1, examDate: "2026-11-30" }), ch("near", { confidence: 3, examDate: "2026-10-24" })];
    expect(ids(studyQueue(chapters, phase, "2026-10-22", "ok", 2))).toEqual(["near", "far"]);
    expect(ids(studyQueue(chapters, phase, "2026-10-22", "ok", 2, ["near"]))).toEqual(["far"]);
  });
});
