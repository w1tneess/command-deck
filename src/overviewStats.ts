import { phaseTarget, rankWeakest } from "../server/logic.ts";
import type { State } from "./api.ts";

const DAY = 86_400_000;
const shift = (day: string, by: number) => new Date(Date.parse(day + "T00:00:00Z") + by * DAY).toISOString().slice(0, 10);

/** Everything the Overview page shows, worked out from the state the server already sends. */
export function overviewStats(state: State) {
  const minutes = new Map(state.heat.map((h) => [h.day, h.minutes]));
  const on = (day: string) => minutes.get(day) ?? 0;
  const span = (from: number, to: number) => { let t = 0; for (let i = from; i <= to; i++) t += on(shift(state.today, -i)); return t; };

  const thisWeek = span(0, 6);
  const lastWeek = span(7, 13);
  const last14 = Array.from({ length: 14 }, (_, i) => { const day = shift(state.today, i - 13); return { day, minutes: on(day) }; });

  // A streak survives until the end of today: an empty today doesn't break it yet.
  let streak = 0;
  for (let i = on(state.today) > 0 ? 0 : 1; on(shift(state.today, -i)) > 0; i++) streak++;

  const chapters = state.subjects.flatMap((s) => s.chapters);
  const started = chapters.filter((c) => c.passes.some(Boolean)).length;
  const phase = state.phases.find((p) => p.id === state.activePhaseId) ?? state.phases[0];
  const weak = rankWeakest(
    state.subjects.flatMap((s) => s.chapters
      .filter((c) => c.status !== "mastered")
      .map((c) => ({ chapter: c, subject: s, confidence: c.confidence, passesDone: c.passes.filter(Boolean).length, examDate: phase ? s.examDates[phase.id] ?? null : null, lastRevised: c.lastRevised }))),
    state.today,
    phase ? phaseTarget(phase, state.today) : state.today,
  ).slice(0, 5);

  const weekStart = shift(state.today, -6);
  const bySubject = new Map<string, number>();
  for (const s of state.sessions) if (s.day >= weekStart) bySubject.set(s.subjectId, (bySubject.get(s.subjectId) ?? 0) + s.minutes);

  return {
    thisWeek, lastWeek, last14, streak,
    chapters: chapters.length, started,
    coveragePct: chapters.length ? Math.round((started / chapters.length) * 100) : 0,
    deliverablesDone: state.deliverables.filter((d) => d.status === "done").length,
    weak,
    bySubject: [...bySubject].sort((a, b) => b[1] - a[1]),
    bestHabitStreak: Math.max(0, ...state.habits.map((h) => h.streak)),
  };
}
