import { studyQueue } from "../server/planner.ts";
import { computeChapterDuration } from "../server/logic.ts";
import type { Chapter, Phase, State, Subject } from "./api.ts";
import { fmtShort, plural } from "./ui.tsx";

export { computeChapterDuration };

/** The phase the app is focused on (the server picks it: manual choice, else the first that hasn't ended). */
export const activeOf = (state: State): Phase => state.phases.find((p) => p.id === state.activePhaseId) ?? state.phases[0];

/** chapter id -> chapter and its subject, for turning a daily target into a name and a reason. */
export function chapterIndex(state: State) {
  const index = new Map<string, { chapter: Chapter; subject: Subject }>();
  for (const subject of state.subjects) for (const chapter of subject.chapters) index.set(chapter.id, { chapter, subject });
  return index;
}

/** Study queue for the active phase, shaped by today's energy check-in, with optional subject filter. */
export function studyQueueFor(state: State, n = 5, subjectId?: string | null) {
  const phase = activeOf(state);
  const subjects = subjectId ? state.subjects.filter((s) => s.id === subjectId) : state.subjects;
  const candidates = subjects.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      chapterId: chapter.id, subjectId: subject.id, priority: subject.priority, confidence: chapter.confidence,
      lastRevised: chapter.lastRevised, status: chapter.status, scope: chapter.scope, examDate: subject.examDates[phase.id] ?? null,
      chapter, subject,
    })),
  );
  return studyQueue(candidates, phase, state.today, state.checkin, n);
}

const PASS_WORDS = ["concept", "PYQs", "sample papers"];

/** "you rate it 2 of 5, not started yet" / "concept pass done" */
export function reasonFor(chapter: Chapter) {
  const done = chapter.passes.flatMap((d, i) => (d ? [PASS_WORDS[i]] : []));
  const parts: string[] = [];
  if (chapter.confidence <= 3) parts.push(`you rate it ${chapter.confidence} of 5`);
  parts.push(done.length === 0 ? "not started yet" : done.length === 3 ? "all passes done" : `${done.join(" and ")} ${done.length === 1 ? "pass" : "passes"} done`);
  return parts.join(", ");
}

const MONTH = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

/** "19 Nov to 2 Dec" once confirmed, "Approx. Jan to Feb" while the dates are placeholders. */
export function whenOf(p: Phase) {
  if (p.confirmed) return `${fmtShort(p.startsOn)} to ${fmtShort(p.endsOn)}`;
  const a = MONTH(p.startsOn), b = MONTH(p.endsOn);
  return a === b ? `Approx. ${a}` : `Approx. ${a} to ${b}`;
}

export const startedCount = (s: Subject) => s.chapters.filter((c) => c.passes.some(Boolean)).length;
export const chaptersLabel = (s: Subject) => (s.chapters.length ? plural(s.chapters.length, "chapter") : "No chapters yet");
