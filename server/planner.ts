import { inScope, phaseTarget, rankNext, type PhaseDates, type Scope, type Status } from "./logic.ts";

export type Energy = "low" | "ok" | "high";
export const ENERGIES: Energy[] = ["low", "ok", "high"];

export type QueueChapter = {
  chapterId: string;
  subjectId: string;
  priority: number;
  confidence: number;
  lastRevised: string | null;
  status: Status;
  scope: Scope;
  /** This subject's exam date in the active phase, if set. */
  examDate: string | null;
};

/** "Lighter" work: a chapter you already know reasonably well or have been through once. */
const isLight = (c: QueueChapter) => c.confidence >= 3;

/**
 * The study queue for a phase. Base order is the date-aware score from rankNext. Energy reshapes it:
 * low puts lighter chapters first (rank order kept within each group), high puts the hardest first
 * (lowest confidence, then score), ok leaves it as is. `exclude` skips chapters already planned.
 */
export function studyQueue<T extends QueueChapter>(
  chapters: T[], phase: PhaseDates & { scope: Scope }, today: string, energy: Energy | null, n: number, exclude: string[] = [],
) {
  const eligible = chapters.filter((c) => c.status !== "mastered" && inScope(c.scope, phase.scope) && !exclude.includes(c.chapterId));
  const ranked = rankNext(eligible, today, phaseTarget(phase, today), eligible.length);
  if (energy === "low") return [...ranked.filter(isLight), ...ranked.filter((c) => !isLight(c))].slice(0, n);
  if (energy === "high") return [...ranked].sort((a, b) => a.confidence - b.confidence || b.score - a.score).slice(0, n);
  return ranked.slice(0, n);
}
