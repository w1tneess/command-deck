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

const NUMERICAL_PROBLEM_SUBJECTS = ["maths", "physics", "chemistry"];

/** High-intensity work: low-confidence chapters in heavy problem-solving subjects. */
export const isHighIntensity = (c: QueueChapter) => c.confidence <= 2 && NUMERICAL_PROBLEM_SUBJECTS.includes(c.subjectId);

/** "Lighter" work: a chapter you already know reasonably well or reading/theory material. */
const isLight = (c: QueueChapter) => c.confidence >= 3;

/**
 * The study queue for a phase. Base order is the date-aware score from rankNext. Energy reshapes it:
 * - Low: prioritizes lighter chapters (confidence >= 3 or reading), placing high-intensity problem-solving
 *   later and tagging them [Needs Fresh Mind].
 * - High: promotes heavy problem-solving and weak-spot numerical chapters (lowest confidence) to the Big 3.
 * - OK: maintains standard date-aware urgency score.
 */
export function studyQueue<T extends QueueChapter>(
  chapters: T[], phase: PhaseDates & { scope: Scope }, today: string, energy: Energy | null, n: number, exclude: string[] = [],
) {
  const eligible = chapters.filter((c) => c.status !== "mastered" && inScope(c.scope, phase.scope) && !exclude.includes(c.chapterId));
  const ranked = rankNext(eligible, today, phaseTarget(phase, today), eligible.length);

  let ordered: typeof ranked;
  if (energy === "low") {
    ordered = [...ranked.filter(isLight), ...ranked.filter((c) => !isLight(c))];
  } else if (energy === "high") {
    ordered = [...ranked].sort((a, b) => {
      const aHeavy = isHighIntensity(a) ? 1 : 0;
      const bHeavy = isHighIntensity(b) ? 1 : 0;
      if (bHeavy !== aHeavy) return bHeavy - aHeavy;
      return a.confidence - b.confidence || b.score - a.score;
    });
  } else {
    ordered = ranked;
  }

  return ordered.slice(0, n).map((c) => ({
    ...c,
    needsFreshMind: energy === "low" && isHighIntensity(c),
  }));
}

