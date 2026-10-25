export type Status = "not_started" | "learning" | "revised" | "mastered";
export const STATUSES: Status[] = ["not_started", "learning", "revised", "mastered"];

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(d + "T00:00:00Z");

/** Today's calendar date in IST, so the count never shifts with the device time zone. */
export function todayIST(now = Date.now()): string {
  return new Date(now + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `today` to `target`; 0 on the day, negative once past. */
export function daysLeft(target: string, today: string): number {
  return Math.round((toUtc(target) - toUtc(today)) / DAY);
}

/** Days from today up to (not including) target that are not in `nonStudy`. */
export function studyDaysLeft(target: string, today: string, nonStudy: string[]): number {
  let n = 0;
  for (let d = toUtc(today); d < toUtc(target); d += DAY) {
    if (!nonStudy.includes(new Date(d).toISOString().slice(0, 10))) n++;
  }
  return n;
}

/** Percent of chapters started (at least one revision pass done), rounded. */
export function startedPct(started: boolean[]): number {
  if (!started.length) return 0;
  return Math.round((started.filter(Boolean).length / started.length) * 100);
}

export type Scope = "unit1" | "unit2" | "pb1" | "pb2" | "board";
export const SCOPES: Scope[] = ["unit1", "unit2", "pb1", "pb2", "board"];
const RANK: Record<Scope, number> = { unit1: 0, unit2: 1, pb1: 2, pb2: 3, board: 4 };

/** Scope is cumulative: a phase covers every chapter tagged at or below its own level. */
export function inScope(chapterScope: Scope, phaseScope: Scope): boolean {
  return RANK[chapterScope] <= RANK[phaseScope];
}

export type PhaseDates = { id: string; startsOn: string; endsOn: string };

/**
 * The phase to focus on: the manual override if set, otherwise the first phase that hasn't ended yet
 * (phases are given in order), otherwise the last one once everything is over.
 */
export function activePhase<T extends PhaseDates>(phases: T[], today: string, override?: string | null): T | undefined {
  return phases.find((p) => p.id === override) ?? phases.find((p) => p.endsOn >= today) ?? phases[phases.length - 1];
}

/**
 * The date a subject without its own exam date is planned against: the phase start while it's ahead,
 * the phase end once it's under way, so subjects still in play don't drop out of the queue.
 */
export function phaseTarget(phase: PhaseDates, today: string): string {
  return phase.startsOn >= today ? phase.startsOn : phase.endsOn;
}

export type Candidate = {
  chapterId: string; subjectId: string; priority: number; confidence: number;
  lastRevised: string | null; examDate: string | null;
};

/**
 * Explainable "study next" order. Score = (6 - confidence) * 10 / (days to that subject's exam + 1),
 * so a shaky chapter in a subject tested soon outranks a shakier one tested later.
 * Subjects with no date use the fallback (PB1 start). Past exams drop out.
 */
export function rankNext<T extends Candidate>(cands: T[], today: string, fallbackDate: string, n = 5) {
  return cands
    .map((c) => {
      const days = daysLeft(c.examDate ?? fallbackDate, today);
      return { ...c, days, score: ((6 - c.confidence) * 10) / (days + 1) };
    })
    .filter((c) => c.days >= 0)
    .sort((a, b) => b.score - a.score || a.priority - b.priority || (a.lastRevised ?? "").localeCompare(b.lastRevised ?? ""))
    .slice(0, n);
}

/** Canonical chapter duration calculator used across Study Queue, Daily Targets, and Calendar scheduling. */
export function computeChapterDuration(confidence?: number, subjectId?: string): string {
  const isHeavy = ["maths", "physics", "chemistry"].includes(subjectId ?? "");
  const conf = confidence ?? 3;
  if (conf <= 1) return isHeavy ? "1h 30m" : "1h 00m";
  if (conf === 2) return isHeavy ? "1h 15m" : "50m";
  if (conf === 3) return isHeavy ? "1h 00m" : "45m";
  return isHeavy ? "45m" : "30m";
}
