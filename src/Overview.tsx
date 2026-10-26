import { useEffect, useState } from "react";
import type { State } from "./api.ts";
import { activeOf, whenOf } from "./model.ts";
import { overviewStats } from "./overviewStats.ts";
import { Card, daysBetween, fmtShort, H2, PageHeader, plural, SubjectBadge } from "./ui.tsx";

const hm = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });

/** Flips true after first paint so bars grow from zero (the global reduced-motion rule makes them snap). */
function useGrow() {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return on;
}

function Tile({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "warn" }) {
  return (
    <div className="animate-fade-in rounded-3xl border border-line bg-surface p-5">
      <div className="text-sm text-muted">{label}</div>
      <div className={`mt-1 font-serif text-3xl font-bold tracking-tight ${tone === "good" ? "text-good" : tone === "warn" ? "text-warn" : "text-fg"}`}>{value}</div>
      <div className="mt-1 text-sm text-muted">{note}</div>
    </div>
  );
}

export function Overview({ state }: { state: State }) {
  const grown = useGrow();
  const phase = activeOf(state);
  const s = overviewStats(state);
  const delta = s.thisWeek - s.lastWeek;
  const max = Math.max(60, ...s.last14.map((d) => d.minutes));
  const exams = state.subjects
    .flatMap((sub) => (sub.examDates[phase.id] ? [{ sub, date: sub.examDates[phase.id] }] : []))
    .filter((e) => e.date >= state.today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(0, 5);

  return (
    <>
      <PageHeader title="Overview" sub={`${phase.name}: ${whenOf(phase)}`} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Tile label="To the exams" value={phase.daysLeft > 0 ? plural(phase.daysLeft, "day") : "Now"} note={`${plural(phase.studyDaysLeft, "study day")} left`} tone={phase.daysLeft > 0 && phase.daysLeft <= 14 ? "warn" : undefined} />
        <Tile label="Syllabus started" value={`${s.coveragePct}%`} note={`${s.started} of ${s.chapters} chapters`} />
        <Tile label="Last 7 days" value={hm(s.thisWeek)} note={s.lastWeek === 0 && delta === 0 ? "Nothing logged yet" : `${delta >= 0 ? "+" : "−"}${hm(Math.abs(delta))} vs the week before`} tone={delta > 0 ? "good" : undefined} />
        <Tile label="Study streak" value={plural(s.streak, "day")} note={`Best habit streak ${plural(s.bestHabitStreak, "day")}`} tone={s.streak >= 3 ? "good" : undefined} />
      </div>

      <div className="flex flex-wrap items-start gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-4 lg:gap-6">
          <Card labelledBy="trend-h">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <H2 id="trend-h">Study time, 14 days</H2>
              <span className="text-sm text-muted">{hm(s.last14.reduce((a, d) => a + d.minutes, 0))} in total</span>
            </div>
            <div role="img" aria-label={`Study minutes per day: ${s.last14.map((d) => `${fmtShort(d.day)} ${d.minutes}`).join(", ")}`} className="mt-5 flex h-40 items-end gap-1.5 border-b border-line">
              {s.last14.map((d) => (
                <div key={d.day} title={`${fmtShort(d.day)}: ${hm(d.minutes)}`} className="flex h-full min-w-0 flex-1 items-end">
                  <div
                    className={`w-full rounded-t-md transition-[height] duration-700 ease-out ${d.day === state.today ? "bg-accent" : "bg-accent/55"}`}
                    style={{ height: grown ? `${Math.max(d.minutes ? 4 : 1, (d.minutes / max) * 100)}%` : "1%" }}
                  />
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="mt-1.5 flex gap-1.5 text-xs text-muted">
              {s.last14.map((d) => <span key={d.day} className="flex-1 text-center">{weekday(d.day)}</span>)}
            </div>
          </Card>

          <Card labelledBy="subj-h">
            <H2 id="subj-h">Subjects</H2>
            <ul className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
              {state.subjects.map((sub) => {
                const mins = s.bySubject.find(([id]) => id === sub.id)?.[1] ?? 0;
                return (
                  <li key={sub.id} className="flex items-center gap-3">
                    <SubjectBadge id={sub.id} label={sub.name} className="w-36 shrink-0" />
                    <div role="progressbar" aria-label={`${sub.name} progress`} aria-valuenow={sub.progressPct} aria-valuemin={0} aria-valuemax={100} className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-surface3">
                      <div className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out" style={{ width: grown ? `${sub.progressPct}%` : "0%" }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-sm tabular-nums text-fg">{sub.progressPct}%</span>
                    <span className="hidden w-16 shrink-0 text-right text-sm text-muted sm:block">{mins ? hm(mins) : "–"}</span>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 mt-3 text-xs text-muted">Right-hand column: time studied in the last 7 days.</p>
          </Card>
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 lg:gap-6">
          <Card labelledBy="exams-h">
            <H2 id="exams-h">Next exams</H2>
            {exams.length === 0 ? (
              <p className="m-0 mt-3 text-sm text-muted">No exam dates set for {phase.name}. Add them in Syllabus.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col p-0">
                {exams.map(({ sub, date }) => {
                  const left = daysBetween(state.today, date);
                  return (
                    <li key={sub.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                      <span className="text-base text-fg">{sub.name}</span>
                      <span className={`shrink-0 text-sm ${left <= 7 ? "font-semibold text-warn" : "text-muted"}`}>{fmtShort(date)} · {left === 0 ? "today" : `${left}d`}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card labelledBy="weak-h">
            <H2 id="weak-h">Needs attention</H2>
            {s.weak.length === 0 ? (
              <p className="m-0 mt-3 text-sm text-muted">Add chapters in Syllabus to see weak spots.</p>
            ) : (
              <ul className="m-0 mt-3 flex list-none flex-col p-0">
                {s.weak.map(({ chapter, subject }) => (
                  <li key={chapter.id} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                    <span className="min-w-0 text-base text-fg">{chapter.name}<span className="block text-sm text-muted">{subject.name}</span></span>
                    <span className="shrink-0 text-sm text-muted">{chapter.confidence} of 5</span>
                  </li>
                ))}
              </ul>
            )}
            <a href="#syllabus" className="mt-3 inline-block text-sm font-medium text-muted hover:text-fg">Open Syllabus</a>
          </Card>

          <Card labelledBy="glance-h">
            <H2 id="glance-h">At a glance</H2>
            <dl className="m-0 mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
              <dt className="text-muted">Due dates done</dt><dd className="m-0 text-right text-fg">{s.deliverablesDone} of {state.deliverables.length}</dd>
              <dt className="text-muted">Habits today</dt><dd className="m-0 text-right text-fg">{state.habits.filter((h) => h.today >= h.goal).length} of {state.habits.length}</dd>
              <dt className="text-muted">Targets today</dt><dd className="m-0 text-right text-fg">{state.targets.filter((t) => t.done).length} of {state.targets.length}</dd>
              <dt className="text-muted">Projects</dt><dd className="m-0 text-right text-fg">{state.projects.length}</dd>
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}
