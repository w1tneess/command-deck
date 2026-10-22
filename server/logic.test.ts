import { describe, expect, it } from "vitest";
import { daysLeft, inScope, progressPct, studyDaysLeft, todayIST, weakestFirst } from "./logic.ts";

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
  it("counts revised and mastered", () => {
    expect(progressPct(["not_started", "learning", "revised", "mastered"])).toBe(50);
    expect(progressPct([])).toBe(0);
  });
  it("makes PB1 cumulative and PB2 complete", () => {
    expect(inScope("earlier", "pb1")).toBe(true);
    expect(inScope("pb1", "pb1")).toBe(true);
    expect(inScope("pb2", "pb1")).toBe(false);
    expect(inScope("pb2", "pb2")).toBe(true);
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
