import { describe, expect, it } from "vitest";
import { activePhase, daysLeft, inScope, phaseTarget, startedPct, studyDaysLeft, todayIST, weakestFirst } from "./logic.ts";

describe("daysLeft", () => {
  it("counts 28 days from 22 Oct to 19 Nov", () => expect(daysLeft("2026-11-19", "2026-10-22")).toBe(28));
  it("is 0 on exam day and negative after", () => {
    expect(daysLeft("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysLeft("2026-11-19", "2026-11-21")).toBe(-2);
  });
});

describe("todayIST", () => {
  it("rolls over at 18:30 UTC, not midnight UTC", () => {
    expect(todayIST(Date.parse("2026-10-22T18:29:00Z"))).toBe("2026-10-22");
    expect(todayIST(Date.parse("2026-10-22T18:31:00Z"))).toBe("2026-10-23");
  });
});

describe("studyDaysLeft", () => {
  it("skips non-study days only", () => {
    expect(studyDaysLeft("2026-11-19", "2026-10-22", ["2026-10-31"])).toBe(27);
    expect(studyDaysLeft("2026-11-19", "2026-10-22", [])).toBe(28);
  });
});

describe("progress and scope", () => {
  it("counts chapters with at least one pass done", () => {
    expect(startedPct([true, false, true, false])).toBe(50);
    expect(startedPct([true, false, false])).toBe(33);
    expect(startedPct([])).toBe(0);
  });
  it("makes each phase cover its own level and everything below", () => {
    expect(inScope("unit1", "pb1")).toBe(true);
    expect(inScope("unit2", "pb1")).toBe(true);
    expect(inScope("unit2", "unit1")).toBe(false);
    expect(inScope("pb1", "pb1")).toBe(true);
    expect(inScope("pb2", "pb1")).toBe(false);
    expect(inScope("board", "pb1")).toBe(false);
    expect(inScope("pb2", "pb2")).toBe(true);
    expect(inScope("board", "pb2")).toBe(false);
    expect(inScope("board", "board")).toBe(true);
  });
});

describe("weakestFirst", () => {
  it("orders by confidence, then oldest revision, never-revised first", () => {
    const xs = [
      { n: "a", confidence: 3, lastRevised: "2026-10-01" },
      { n: "b", confidence: 2, lastRevised: "2026-10-10" },
      { n: "c", confidence: 2, lastRevised: null },
    ];
    expect(weakestFirst(xs).map((x) => x.n)).toEqual(["c", "b", "a"]);
  });
});

import { rankNext } from "./logic.ts";
describe("rankNext", () => {
  const base = { priority: 1, lastRevised: null };
  it("puts a soon exam ahead of a shakier, later one", () => {
    const out = rankNext(
      [
        { ...base, chapterId: "later", subjectId: "a", confidence: 1, examDate: "2026-11-30" },
        { ...base, chapterId: "soon", subjectId: "b", confidence: 3, examDate: "2026-10-24" },
      ],
      "2026-10-22", "2026-11-19",
    );
    expect(out.map((x) => x.chapterId)).toEqual(["soon", "later"]);
  });
  it("uses the fallback date, drops past exams, breaks ties by priority", () => {
    const out = rankNext(
      [
        { ...base, chapterId: "past", subjectId: "a", confidence: 1, examDate: "2026-10-01" },
        { ...base, chapterId: "p2", subjectId: "b", priority: 2, confidence: 2, examDate: null },
        { ...base, chapterId: "p1", subjectId: "c", priority: 1, confidence: 2, examDate: null },
      ],
      "2026-10-22", "2026-11-19",
    );
    expect(out.map((x) => x.chapterId)).toEqual(["p1", "p2"]);
  });
});

describe("activePhase", () => {
  const phases = [
    { id: "pb1", startsOn: "2026-11-19", endsOn: "2026-12-02" },
    { id: "pb2", startsOn: "2026-12-20", endsOn: "2027-01-05" },
  ];
  it("follows the first phase that hasn't ended, including while it is under way", () => {
    expect(activePhase(phases, "2026-10-22")?.id).toBe("pb1");
    expect(activePhase(phases, "2026-11-25")?.id).toBe("pb1");
    expect(activePhase(phases, "2026-12-02")?.id).toBe("pb1");
    expect(activePhase(phases, "2026-12-03")?.id).toBe("pb2");
  });
  it("sticks to the last phase once everything is over", () => {
    expect(activePhase(phases, "2027-06-01")?.id).toBe("pb2");
  });
  it("honours a manual override, and ignores an unknown one", () => {
    expect(activePhase(phases, "2026-10-22", "pb2")?.id).toBe("pb2");
    expect(activePhase(phases, "2026-10-22", "gone")?.id).toBe("pb1");
    expect(activePhase(phases, "2026-10-22", null)?.id).toBe("pb1");
  });
});

describe("phaseTarget", () => {
  const p = { id: "pb1", startsOn: "2026-11-19", endsOn: "2026-12-02" };
  it("is the start before the phase and the end once it is under way", () => {
    expect(phaseTarget(p, "2026-10-22")).toBe("2026-11-19");
    expect(phaseTarget(p, "2026-11-19")).toBe("2026-11-19");
    expect(phaseTarget(p, "2026-11-20")).toBe("2026-12-02");
  });
});
