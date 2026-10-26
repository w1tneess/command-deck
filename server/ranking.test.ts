import { describe, expect, it } from "vitest";
import { rankNext, rankWeakest, tieBreak } from "./logic.ts";

const TODAY = "2026-11-01";
const c = (chapterId: string, over: Partial<{ examDate: string | null; lastRevised: string | null; confidence: number; priority: number }> = {}) =>
  ({ chapterId, subjectId: "s", priority: 1, confidence: 1, lastRevised: null, examDate: "2026-11-19", ...over });

describe("tie-breakers when every chapter scores the same", () => {
  it("prefers the nearer exam, then the longest since studied, then syllabus order", () => {
    const ranked = rankNext(
      [
        c("a-never-far", { examDate: "2026-11-25" }),
        c("b-recent-near", { examDate: "2026-11-19", lastRevised: "2026-10-30" }),
        c("c-old-near", { examDate: "2026-11-19", lastRevised: "2026-10-01" }),
        c("d-never-near", { examDate: "2026-11-19" }),
        c("e-never-near", { examDate: "2026-11-19" }),
      ],
      TODAY, "2026-11-19", 10,
    );
    // the far exam scores lower, so it can't tie; among the four near ones: never studied first (in syllabus order), then oldest, then newest
    expect(ranked.map((r) => r.chapterId)).toEqual(["d-never-near", "e-never-near", "c-old-near", "b-recent-near", "a-never-far"]);
  });

  it("keeps syllabus order when nothing separates the chapters", () => {
    const ranked = rankNext([c("x"), c("y"), c("z")], TODAY, "2026-11-19", 3);
    expect(ranked.map((r) => r.chapterId)).toEqual(["x", "y", "z"]);
  });

  it("tieBreak treats a past exam as far away", () => {
    expect(tieBreak({ days: -3, lastRevised: null }, { days: 20, lastRevised: null })).toBe(1);
  });
});

describe("rankWeakest", () => {
  const w = (id: string, over: Partial<{ examDate: string | null; lastRevised: string | null; confidence: number; passesDone: number }> = {}) =>
    ({ id, confidence: 1, passesDone: 0, examDate: "2026-11-19", lastRevised: null, ...over });

  it("orders by confidence, then passes, then exam date, then last studied, then input order", () => {
    const out = rankWeakest(
      [
        w("conf3", { confidence: 3 }),
        w("far", { examDate: "2026-12-30" }),
        w("old", { lastRevised: "2026-09-01" }),
        w("one-pass", { passesDone: 1 }),
        w("first"),
        w("second"),
      ],
      TODAY, "2026-11-19",
    );
    expect(out.map((x) => x.id)).toEqual(["first", "second", "old", "far", "one-pass", "conf3"]);
  });
});
