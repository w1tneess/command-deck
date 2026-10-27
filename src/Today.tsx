import { useId, useRef, useState } from "react";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { type FocusModel } from "./Focus.tsx";
import { Btn, Check, plural } from "./ui.tsx";
import { activeOf, chapterIndex, computeChapterDuration, reasonFor, studyQueueFor } from "./model.ts";

interface TodayProps {
  state: State;
  act: Act;
  focus: FocusModel;
  onOpenZen?: () => void;
  onOpenViva?: (chapter: Chapter, subject: Subject) => void;
  onOpenCommandBar?: () => void;
}

const daysUntil = (from: string, to: string) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86_400_000);
const shortDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Today answers one question: what do I do now? One "Next up" card, the day's short list, what's due, and the habits.
 * Everything else lives a tap away (Study, Plan, Life).
 */
export function Today({ state, act, focus, onOpenViva }: TodayProps) {
  const phase = activeOf(state);
  const index = chapterIndex(state);
  const queue = studyQueueFor(state, 5);
  const suggestions = queue.filter((q) => !state.targets.some((t) => t.chapterId === q.chapterId));

  const istHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date()));
  const greeting = istHour < 12 ? "Good morning" : istHour < 17 ? "Good afternoon" : "Good evening";

  const studiedMin = state.sessions.filter((s) => s.day === state.today).reduce((sum, s) => sum + s.minutes, 0);
  const studied = studiedMin ? `${Math.floor(studiedMin / 60)}h ${studiedMin % 60}m studied today` : "Nothing studied yet today";

  const open = state.targets.filter((t) => !t.done);
  const nextTarget = open[0];
  const nextSuggestion = nextTarget ? undefined : queue[0];

  const nextChapter = nextTarget?.chapterId ? index.get(nextTarget.chapterId) : nextSuggestion ? { chapter: nextSuggestion.chapter, subject: nextSuggestion.subject } : undefined;

  // --- add a target (guarded against double submits)
  const addId = useId();
  const [title, setTitle] = useState("");
  const busy = useRef(false);
  const guarded = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try { await fn(); } finally { busy.current = false; }
  };
  const addTarget = () => guarded(async () => {
    const t = title.trim();
    if (!t) return;
    if (await act("POST", "/api/targets", { title: t, duration: "45m" })) setTitle("");
  });
  const addSuggestion = (q: (typeof queue)[number]) => guarded(() =>
    act("POST", "/api/targets", { chapterId: q.chapterId, subjectId: q.subjectId, duration: computeChapterDuration(q.confidence, q.subjectId), title: `${q.subject.name}: ${q.chapter.name}` }),
  );
  const toggleTarget = (id: number, done: boolean) => guarded(() => act("PATCH", `/api/targets/${id}`, { done: !done }));
  const removeTarget = (id: number) => guarded(() => act("DELETE", `/api/targets/${id}`));
  const toggleHabit = (id: number, today: number, goal: number) => guarded(() => act("PUT", `/api/habits/${id}/log`, { value: today >= goal ? 0 : goal }));

  // --- what's due: overdue first, then soonest; finished ones stay out
  const due = state.deliverables
    .filter((d) => d.status !== "done" && d.due)
    .sort((a, b) => (a.due! < b.due! ? -1 : 1));
  const dueShown = due.slice(0, 4);

  const nextTitle = nextTarget?.title ?? (nextSuggestion ? `${nextSuggestion.subject.name}: ${nextSuggestion.chapter.name}` : null);
  const nextDuration = nextTarget?.duration ?? (nextSuggestion ? computeChapterDuration(nextSuggestion.confidence, nextSuggestion.subjectId) : null);
  const nextNote = nextChapter ? reasonFor(nextChapter.chapter) : "";

  return (
    <div className="flex w-full flex-col gap-8">
      <header>
        <h1 className="m-0 font-serif text-3xl font-bold tracking-tight text-fg sm:text-4xl">{greeting}, Advaita</h1>
        <p className="m-0 mt-1 text-base text-muted">
          {phase.daysLeft > 0 ? `${plural(phase.daysLeft, "day")} to ${phase.name}. ` : ""}
          {studied}.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div className="contents">
          {/* Next up: the single thing to do now */}
          <section aria-labelledby="next-h" className="rounded-2xl bg-surface2 p-5 ring-1 ring-line md:col-span-2">
            <h2 id="next-h" className="m-0 text-sm font-medium text-muted">Next up</h2>
            {nextTitle ? (
              <>
                <p className="m-0 mt-3 font-serif text-2xl font-semibold leading-snug tracking-tight text-fg sm:text-3xl">
                  <span className="swipe">{nextTitle}</span>
                </p>
                <p className="m-0 mt-3 text-sm text-muted">
                  {[nextDuration, nextNote].filter(Boolean).join(" · ")}
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Btn kind="primary" onClick={() => void (focus.running ? focus.stop() : focus.start())}>
                    {focus.running ? "Stop focus" : "Start focus"}
                  </Btn>
                  {nextTarget ? (
                    <Btn onClick={() => void toggleTarget(nextTarget.id, false)}>Mark done</Btn>
                  ) : (
                    nextSuggestion && <Btn onClick={() => void addSuggestion(nextSuggestion)}>Add to today</Btn>
                  )}
                  {nextChapter && onOpenViva && (
                    <Btn kind="ghost" onClick={() => onOpenViva(nextChapter.chapter, nextChapter.subject)}>Quiz me</Btn>
                  )}
                </div>
              </>
            ) : (
              <p className="m-0 mt-3 font-serif text-2xl font-semibold text-fg">Nothing left. Add a target below, or rest.</p>
            )}
          </section>

          {/* Today's list */}
          <section aria-labelledby="plan-h" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 id="plan-h" className="m-0 font-serif text-xl font-semibold tracking-tight text-fg">Today's plan</h2>
              <span className="text-sm text-muted">{state.targets.filter((t) => t.done).length} of {state.targets.length} done</span>
            </div>
            {state.targets.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-3 p-0 md:gap-4">
                {state.targets.map((t) => (
                  <li key={t.id} className="group flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => void toggleTarget(t.id, t.done)}
                      aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`}
                      className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 rounded-xl border-0 bg-transparent p-0 text-left cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <Check on={t.done} />
                      <span className={`min-w-0 text-base ${t.done ? "text-muted line-through" : "text-fg"}`}>{t.title}</span>
                    </button>
                    {t.duration && <span className="shrink-0 text-sm text-muted">{t.duration}</span>}
                    <button
                      type="button"
                      onClick={() => void removeTarget(t.id)}
                      aria-label={`Remove ${t.title}`}
                      className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent px-2 text-sm text-muted hover:text-danger cursor-pointer focus-visible:ring-2 focus-visible:ring-focus lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => { e.preventDefault(); void addTarget(); }}
            >
              <label htmlFor={`${addId}-add`} className="sr-only">Add something to do today</label>
              <input
                id={`${addId}-add`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Add something to do today"
                className="h-11 min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-base text-fg placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus"
              />
              <Btn type="submit" disabled={!title.trim()}>Add</Btn>
            </form>

            {suggestions.length > 0 && (
              <div className="mt-2">
                <h3 className="m-0 text-sm font-medium text-muted">Suggested chapters</h3>
                <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0 md:gap-4">
                  {suggestions.map((q) => (
                    <li key={q.chapterId} className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-base text-fg">{q.subject.name}: {q.chapter.name}</div>
                        <div className="text-sm text-muted">{reasonFor(q.chapter)}</div>
                      </div>
                      <Btn onClick={() => void addSuggestion(q)}>Add</Btn>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-8 md:items-stretch">
          <section aria-labelledby="due-h" className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 id="due-h" className="m-0 font-serif text-xl font-semibold tracking-tight text-fg">Due soon</h2>
              <a href="#deliverables" className="inline-flex min-h-[44px] items-center rounded-xl text-sm font-medium text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-focus">All due dates</a>
            </div>
            {dueShown.length === 0 ? (
              <p className="m-0 text-sm text-muted">Nothing due. Nice.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-3 p-0 md:gap-4">
                {dueShown.map((d) => {
                  const left = daysUntil(state.today, d.due!);
                  const late = left < 0;
                  return (
                    <li key={d.id} className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-base text-fg">{d.name}</div>
                        <div className="text-sm text-muted">{d.subject}</div>
                      </div>
                      <div className={`shrink-0 text-right text-sm ${late ? "font-semibold text-danger" : left <= 3 ? "font-semibold text-warn" : "text-muted"}`}>
                        {late ? `${plural(-left, "day")} late` : left === 0 ? "Today" : shortDate(d.due!)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {state.habits.length > 0 && (
            <section aria-labelledby="habits-h" className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 id="habits-h" className="m-0 font-serif text-xl font-semibold tracking-tight text-fg">Habits</h2>
                <a href="#habits" className="inline-flex min-h-[44px] items-center rounded-xl text-sm font-medium text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-focus">All habits</a>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.habits.map((h) => {
                  const done = h.today >= h.goal;
                  const label = h.kind === "count" ? `${h.name} ${h.today}/${h.goal}` : h.name;
                  return (
                    <button
                      key={h.id}
                      type="button"
                      aria-pressed={done}
                      aria-label={label}
                      onClick={() => void toggleHabit(h.id, h.today, h.goal)}
                      className={`min-h-[44px] rounded-full border px-3 text-sm font-medium cursor-pointer md:min-h-[36px] focus-visible:ring-2 focus-visible:ring-focus ${done ? "border-transparent bg-accent/15 text-accent" : "border-line-strong bg-transparent text-muted hover:bg-surface3 hover:text-fg"}`}
                    >
                      {done ? "✓ " : ""}{label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
