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

/** Percent of chapters revised or mastered, rounded. */
export function progressPct(statuses: Status[]): number {
  if (!statuses.length) return 0;
  const done = statuses.filter((s) => s === "revised" || s === "mastered").length;
  return Math.round((done / statuses.length) * 100);
}

/** Exam scope is cumulative: PB1 covers earlier + pb1 chapters, PB2 covers everything. */
export function inScope(introducedIn: "earlier" | "pb1" | "pb2", exam: "pb1" | "pb2"): boolean {
  return exam === "pb2" || introducedIn !== "pb2";
}

/** Weakest first: low confidence, then least recently revised (never revised first). */
export function weakestFirst<T extends { confidence: number; lastRevised: string | null }>(xs: T[]): T[] {
  return [...xs].sort(
    (a, b) => a.confidence - b.confidence || (a.lastRevised ?? "").localeCompare(b.lastRevised ?? ""),
  );
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
