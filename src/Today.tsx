import { useId, useRef, useState } from "react";
import { ENERGIES, type Energy } from "../server/planner.ts";
import type { Act, Phase, State } from "./api.ts";
import { FocusCard, type FocusModel } from "./Focus.tsx";
import { activeOf, chapterIndex, reasonFor, studyQueueFor, whenOf } from "./model.ts";
import { Evening, Morning } from "./Routine.tsx";
import { Btn, Card, Check, ConfDots, H2, PassPills, Pill, daysBetween, fmtLong, fmtShort, fmtWeekdayDate } from "./ui.tsx";

const ENERGY_LABEL: Record<Energy, string> = { low: "Low", ok: "OK", high: "High" };
const ENERGY_NOTE = "Low puts lighter chapters first. High puts the hardest first.";

export function Today({ state, act, focus }: { state: State; act: Act; focus: FocusModel }) {
  return (
    <>
      <Header state={state} act={act} />
      <Hero state={state} act={act} />
      <DailyMomentum state={state} focus={focus} />
      <div className="flex flex-wrap items-start gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-4 lg:gap-6">
          <Morning state={state} act={act} />
          <Targets state={state} act={act} focus={focus} />
          <Queue state={state} act={act} />
          <Evening key={state.routine.day} state={state} act={act} />
        </div>
        {/* On a phone this column holds energy & quick habits, which sit above the targets. */}
        <div className="order-first flex min-w-0 flex-[2_1_320px] flex-col gap-4 lg:order-none lg:gap-6">
          <div className="hidden lg:block"><FocusCard focus={focus} state={state} /></div>
          <Energy state={state} act={act} />
          <DailyHabitsWidget state={state} act={act} />
        </div>
      </div>
    </>
  );
}

function Header({ state, act }: { state: State; act: Act }) {
  const upcoming = state.phases.find((p) => state.today <= p.endsOn) ?? activeOf(state);
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 lg:gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">{fmtWeekdayDate(state.today)}</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Today</h1>
      </div>
      <label className="flex items-center gap-3">
        <span className="hidden text-[13px] text-muted lg:inline">Phase</span>
        <select
          aria-label="Phase"
          title={state.autoPhase ? "Following the calendar" : "Chosen by you"}
          value={state.autoPhase ? "auto" : (state.activePhaseId ?? "auto")}
          onChange={(e) => act("PUT", "/api/active-phase", { phaseId: e.target.value === "auto" ? null : e.target.value })}
          className="h-11 rounded-full border border-line bg-surface px-3 text-[13px] text-muted lg:h-11 lg:rounded-xl lg:px-3.5 lg:text-[14px] lg:text-fg"
        >
          <option value="auto">Auto: {upcoming.name}</option>
          {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    </header>
  );
}

function Hero({ state, act }: { state: State; act: Act }) {
  const phase = activeOf(state);
  const over = state.today > phase.endsOn;
  const started = !over && phase.daysLeft <= 0;
  const subjectDates = state.subjects.some((s) => s.examDates[phase.id]);
  const big = over ? "Over" : String(started ? Math.max(0, daysTo(state.today, phase)) : phase.daysLeft);
  const unit = over ? "" : started ? "days left" : "days to go";

  // Calculate elapsed percentage within phase
  const totalDays = Math.max(1, daysBetween(phase.startsOn, phase.endsOn));
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(phase.startsOn, state.today)));
  const phasePct = Math.round((elapsedDays / totalDays) * 100);

  return (
    <section
      aria-label="Countdown"
      className="relative overflow-hidden flex flex-wrap items-center justify-between gap-6 rounded-[22px] bg-gradient-to-br from-[#3b36cc] via-[#4338ca] to-[#1e1b4b] p-5 text-ink shadow-[0_8px_32px_rgba(67,56,202,0.28)] border border-white/20 lg:rounded-[26px] lg:p-7"
    >
      {/* Soft specular sheen */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.22),transparent_65%)]" />

      <div className="relative z-10 flex min-w-[240px] flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-good shadow-[0_0_6px_rgba(48,209,88,0.8)]" />
            {phase.name}
          </span>
          {phase.confirmed ? (
            <span className="text-xs text-white/75 font-medium">· Confirmed dates</span>
          ) : (
            <span className="text-xs text-white/75 font-medium">· Dates approximate</span>
          )}
        </div>

        <div className="mt-0.5 flex items-baseline gap-2.5 lg:mt-1.5 lg:gap-3.5">
          <span className="font-mono text-[64px] font-bold leading-none tracking-tight tabular-nums lg:text-[96px]">{big}</span>
          <span className="text-lg font-medium text-white/90 lg:text-[22px]">{unit}</span>
        </div>

        <div className="text-[13px] text-white/80 lg:text-[14px]">
          {fmtShort(phase.startsOn)} to {fmtLong(phase.endsOn)}
          {!over && !subjectDates && <span className="hidden lg:inline"> · subject dates not set yet</span>}
        </div>

        {/* Phase timeline progress */}
        <div className="mt-1 flex max-w-xs items-center gap-2.5 text-xs text-white/75">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-white transition-all duration-300 ease-out" style={{ width: `${phasePct}%` }} />
          </div>
          <span className="font-mono">{phasePct}% elapsed</span>
        </div>
      </div>

      {/* Phase selection list */}
      <ol className="relative z-10 m-0 hidden min-w-[260px] flex-[0_1_340px] list-none flex-col gap-1.5 p-0 lg:flex">
        {state.phases.map((p: Phase) => {
          const isActive = p.id === phase.id;
          return (
            <li
              key={p.id}
              aria-current={isActive ? "true" : undefined}
              onClick={() => {
                if (!isActive) void act("PUT", "/api/active-phase", { phaseId: p.id });
              }}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-150 ${
                isActive
                  ? "bg-white/20 shadow-xs ring-1 ring-white/30 font-semibold"
                  : "bg-white/10 hover:bg-white/15 opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={`size-2 rounded-full ${isActive ? "bg-good shadow-[0_0_8px_rgba(48,209,88,0.9)]" : "bg-white/40"}`} />
                <span className="text-[14px]">{p.name}</span>
              </div>
              <span className="font-mono text-[13px] text-white/80">{whenOf(p)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Glanceable telemetry cards summarizing today's key study metrics. */
function DailyMomentum({ state, focus }: { state: State; focus: FocusModel }) {
  const doneTargets = state.targets.filter((t) => t.done).length;
  const totalTargets = state.targets.length;
  const targetPct = totalTargets > 0 ? Math.round((doneTargets / totalTargets) * 100) : 0;

  const todayFocusMins = state.sessions
    .filter((s) => s.day === state.today)
    .reduce((acc, s) => acc + s.minutes, 0);

  const doneHabits = state.habits.filter((h) => h.today >= h.goal).length;
  const totalHabits = state.habits.length;

  return (
    <section aria-label="Daily momentum" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:gap-4">
      {/* Targets */}
      <div className="flex flex-col justify-between rounded-[18px] border border-line/75 bg-surface/90 p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] lg:p-4">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-medium uppercase tracking-wider">Targets</span>
          <span className="font-mono text-xs">{targetPct}%</span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold tracking-tight text-fg lg:text-3xl">{doneTargets}</span>
          <span className="font-mono text-xs text-muted">/ {totalTargets}</span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
          <div className="h-full bg-gradient-to-r from-accent to-accent-text transition-all duration-300 ease-out" style={{ width: `${targetPct}%` }} />
        </div>
      </div>

      {/* Focus Time */}
      <div className="flex flex-col justify-between rounded-[18px] border border-line/75 bg-surface/90 p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] lg:p-4">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-medium uppercase tracking-wider">Focus Time</span>
          {focus.running && <span className="flex size-2 rounded-full bg-accent animate-pulse" title="Focus session running" />}
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="font-mono text-2xl font-bold tracking-tight text-fg lg:text-3xl">
            {todayFocusMins >= 60 ? `${Math.floor(todayFocusMins / 60)}h ${todayFocusMins % 60}m` : `${todayFocusMins}m`}
          </span>
        </div>
        <span className="mt-2.5 truncate text-xs text-muted">
          {focus.running ? `${focus.label} running` : `${state.sessions.filter((s) => s.day === state.today).length} sessions`}
        </span>
      </div>

      {/* Habits */}
      <div className="flex flex-col justify-between rounded-[18px] border border-line/75 bg-surface/90 p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] lg:p-4">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-medium uppercase tracking-wider">Habits</span>
          <span className="font-mono text-xs text-good">{doneHabits === totalHabits && totalHabits > 0 ? "✓ Done" : ""}</span>
        </div>
        <div className="mt-2 flex items-baseline gap-1.5">
          <span className="font-mono text-2xl font-bold tracking-tight text-fg lg:text-3xl">{doneHabits}</span>
          <span className="font-mono text-xs text-muted">/ {totalHabits}</span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
          <div className="h-full bg-good transition-all duration-300 ease-out" style={{ width: `${totalHabits > 0 ? (doneHabits / totalHabits) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Routine */}
      <div className="flex flex-col justify-between rounded-[18px] border border-line/75 bg-surface/90 p-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.1)] lg:p-4">
        <div className="flex items-center justify-between text-muted">
          <span className="text-xs font-medium uppercase tracking-wider">Routine</span>
          {state.routine.sleep ? <span className="font-mono text-xs text-accent-text">{state.routine.sleep}/5 sleep</span> : null}
        </div>
        <div className="mt-2">
          <div className="truncate text-base font-semibold text-fg lg:text-lg">
            {state.routine.shutdownAt ? "Shut down" : state.routine.kickoffAt ? "Active day" : "Not kicked off"}
          </div>
        </div>
        <span className="mt-2.5 truncate text-xs text-muted">
          {state.checkin ? `Energy: ${ENERGY_LABEL[state.checkin]}` : "Energy pending"}
        </span>
      </div>
    </section>
  );
}

/** Days left in a phase that has already begun. */
const daysTo = (today: string, p: Phase) => Math.round((Date.parse(p.endsOn) - Date.parse(today)) / 86_400_000);

function Targets({ state, act, focus }: { state: State; act: Act; focus: FocusModel }) {
  const index = chapterIndex(state);
  const [adding, setAdding] = useState(false);
  const done = state.targets.filter((t) => t.done).length;
  const allDone = done > 0 && done === state.targets.length;

  return (
    <Card labelledBy="targets-h">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <H2 id="targets-h">Daily targets</H2>
          <span className="font-mono text-[13px] text-muted">{done} of {state.targets.length} done</span>
        </div>
        <Btn kind={adding ? "secondary" : "primary"} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "+ Add target"}
        </Btn>
      </div>

      {/* Continuous progress indicator */}
      {state.targets.length > 0 && (
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-line/60">
          <div
            className={`h-full transition-all duration-300 ease-out ${allDone ? "bg-good" : "bg-gradient-to-r from-accent to-accent-text"}`}
            style={{ width: `${(done / state.targets.length) * 100}%` }}
          />
        </div>
      )}

      {/* Celebratory banner */}
      {allDone && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-good/30 bg-good/10 px-3.5 py-2.5 text-[13px] font-medium text-good">
          <span className="text-base">🎉</span>
          <span>All daily targets finished for today. Outstanding momentum!</span>
        </div>
      )}

      {adding && <AddTarget state={state} act={act} onDone={() => setAdding(false)} />}

      {state.targets.length === 0 && (
        <p className="m-0 border-t border-line py-4 text-[14px] text-muted">Nothing planned. Add a target to start the day.</p>
      )}

      {state.targets.map((t) => {
        const hit = t.chapterId ? index.get(t.chapterId) : undefined;
        const subjectId = hit ? hit.subject.id : t.subjectId;
        return (
          <TargetRow
            key={t.id}
            id={t.id}
            done={t.done}
            name={hit ? hit.chapter.name : t.title}
            sub={hit ? `${hit.subject.name} · ${reasonFor(hit.chapter)}` : "Custom target"}
            swappable={!!t.chapterId && !t.done}
            act={act}
            onFocus={
              subjectId
                ? () => {
                    focus.setSubject(subjectId);
                    if (!focus.running) void focus.start();
                  }
                : undefined
            }
          />
        );
      })}

      <div className="border-t border-line pt-3 text-[13px] text-muted">
        Three suggested a day, up to eight with your own. Click Focus to launch a Pomodoro round.
      </div>
    </Card>
  );
}

function TargetRow({
  id,
  done,
  name,
  sub,
  swappable,
  act,
  onFocus,
}: {
  id: number;
  done: boolean;
  name: string;
  sub: string;
  swappable: boolean;
  act: Act;
  onFocus?: () => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line py-2 lg:gap-3 lg:py-2.5">
      <button
        type="button"
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${name}`}
        aria-pressed={done}
        onClick={() => act("PATCH", `/api/targets/${id}`, { done: !done })}
        className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-95"
      >
        <Check on={done} />
      </button>

      <div className="min-w-0 flex-1 basis-[180px]">
        <div className={`text-[15px] font-medium lg:text-base transition-colors ${done ? "text-muted line-through" : "text-fg"}`}>{name}</div>
        <div className="text-xs text-muted lg:mt-0.5 lg:text-[13px]">{sub}</div>
      </div>

      <div className="flex items-center gap-1.5">
        {onFocus && !done && (
          <button
            type="button"
            title="Start focus timer on this subject"
            onClick={onFocus}
            className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-2.5 text-xs font-medium text-accent-text transition-all hover:bg-accent hover:text-ink active:scale-95"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Focus</span>
          </button>
        )}

        <button
          type="button"
          aria-label={`More actions for ${name}`}
          aria-expanded={more}
          onClick={() => setMore((m) => !m)}
          className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent text-muted lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>

        <div className={`${more ? "flex basis-full justify-end pt-1" : "hidden"} gap-1.5 lg:flex lg:basis-auto`}>
          {swappable && (
            <Btn kind="ghost" className="h-8 px-2.5 text-xs" onClick={() => act("POST", `/api/targets/${id}/swap`)}>
              Swap
            </Btn>
          )}
          <Btn kind="ghost" className="h-8 px-2.5 text-xs text-muted hover:text-warn" aria-label={`Remove ${name}`} onClick={() => act("DELETE", `/api/targets/${id}`)}>
            Remove
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Add a chapter from the syllabus, or type a target of your own. */
function AddTarget({ state, act, onDone }: { state: State; act: Act; onDone: () => void }) {
  const uid = useId();
  const chapterIdKey = `${uid}-chapter`;
  const textIdKey = `${uid}-text`;
  const [chapterId, setChapterId] = useState("");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const planned = new Set(state.targets.map((t) => t.chapterId));

  const submit = async () => {
    if (busy.current) return;
    const trimmed = text.trim();
    if (!chapterId && !trimmed) return;
    busy.current = true;
    setSaving(true);
    try {
      const ok = await act("POST", "/api/targets", chapterId ? { chapterId } : { title: trimmed });
      if (ok) {
        setChapterId("");
        setText("");
        onDone();
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="mb-2 flex flex-wrap items-end gap-3 border-t border-line py-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label htmlFor={chapterIdKey} className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] text-muted">
        Chapter from syllabus
        <select
          id={chapterIdKey}
          value={chapterId}
          disabled={saving || !!text.trim()}
          onChange={(e) => setChapterId(e.target.value)}
          className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg disabled:opacity-50"
        >
          <option value="">Pick a chapter</option>
          {state.subjects.filter((s) => s.chapters.length).map((s) => (
            <optgroup key={s.id} label={s.name}>
              {s.chapters.filter((c) => !planned.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label htmlFor={textIdKey} className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] text-muted">
        Or write your own
        <input
          id={textIdKey}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Finish the Maths lab file"
          disabled={saving || !!chapterId}
          className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg disabled:opacity-50"
        />
      </label>
      <Btn type="submit" kind="primary" disabled={saving || (!chapterId && !text.trim())}>
        {saving ? "Adding…" : "Add target"}
      </Btn>
    </form>
  );
}

function Queue({ state, act }: { state: State; act: Act }) {
  const picks = studyQueueFor(state);
  const phase = activeOf(state);
  const over = state.today > phase.endsOn;
  const plannedSet = new Set(state.targets.map((t) => t.chapterId).filter(Boolean));
  const canPlanMore = state.targets.length < 8;

  return (
    <Card labelledBy="queue-h">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <H2 id="queue-h">Study queue</H2>
          <span className="text-[13px] text-muted">Ranked by confidence and exam dates</span>
        </div>
        <span className="text-xs text-muted">
          Energy: <span className="font-semibold text-accent-text">{ENERGY_LABEL[state.checkin ?? "ok"]}</span>
        </span>
      </div>

      {picks.length === 0 && (
        <p className="m-0 border-t border-line py-4 text-[14px] text-muted">
          {over ? "This phase is over. Switch phase above to plan the next one." : "Nothing left in scope. Add chapters under Syllabus, or switch phase."}
        </p>
      )}

      {picks.map((q, i) => {
        const isPlanned = plannedSet.has(q.chapterId);
        return (
          <div key={q.chapterId} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="w-5 font-mono text-[13px] font-semibold text-muted pt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{q.chapter.name}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <Pill>{q.subject.name}</Pill>
                  <ConfDots value={q.chapter.confidence} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <PassPills passes={q.chapter.passes} />
              {isPlanned ? (
                <span className="inline-flex items-center gap-1 rounded-lg border border-good/40 bg-good/10 px-2.5 py-1 text-xs font-medium text-good">
                  <span>✓</span> Planned
                </span>
              ) : (
                <button
                  type="button"
                  disabled={!canPlanMore}
                  title={canPlanMore ? "Add to today's daily targets" : "Daily targets limit reached (max 8)"}
                  onClick={() => act("POST", "/api/targets", { chapterId: q.chapterId })}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface2/80 px-2.5 text-xs font-medium text-fg transition-all hover:border-accent hover:text-accent-text active:scale-95 disabled:opacity-40"
                >
                  <span>+</span> Plan today
                </button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function Energy({ state, act }: { state: State; act: Act }) {
  return (
    <section aria-label="Energy check-in" className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3.5 lg:rounded-[20px] lg:border lg:border-line/75 lg:bg-surface/90 lg:px-6 lg:py-5 lg:shadow-[0_2px_12px_rgba(0,0,0,0.14)]">
      <h2 className="m-0 hidden text-[17px] font-semibold tracking-[-0.015em] lg:block">Energy check-in</h2>
      <span className="w-[52px] text-[13px] text-muted lg:hidden">Energy</span>
      <div className="flex flex-1 gap-1.5 rounded-xl bg-surface2/60 p-1 border border-line/60" role="group" aria-label="Energy today">
        {ENERGIES.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={state.checkin === e}
            onClick={() => act("POST", "/api/checkin", { energy: e })}
            className={`h-10 flex-1 rounded-[9px] text-[14px] font-medium transition-all duration-150 ${
              state.checkin === e
                ? "bg-accent text-ink shadow-[0_1px_3px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]"
                : "text-muted hover:text-fg"
            }`}
          >
            {ENERGY_LABEL[e]}
          </button>
        ))}
      </div>
      <p className="m-0 hidden text-[13px] text-muted lg:block">{ENERGY_NOTE}</p>
    </section>
  );
}

/** Compact habits check-off widget directly in the Today command center. */
function DailyHabitsWidget({ state, act }: { state: State; act: Act }) {
  if (state.habits.length === 0) return null;
  const doneToday = state.habits.filter((h) => h.today >= h.goal).length;

  return (
    <Card labelledBy="today-habits-h">
      <div className="mb-2 flex items-baseline justify-between">
        <H2 id="today-habits-h">Today's Habits</H2>
        <span className="font-mono text-[13px] text-muted">{doneToday} of {state.habits.length} done</span>
      </div>

      <div className="flex flex-col">
        {state.habits.map((h) => {
          const done = h.today >= h.goal;
          return (
            <div key={h.id} className="flex items-center justify-between gap-3 border-t border-line py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  role="switch"
                  aria-checked={done}
                  aria-label={`${h.name}: ${done ? "done" : "not done"}`}
                  onClick={() => act("PUT", `/api/habits/${h.id}/log`, { value: done ? 0 : h.goal })}
                  className="flex size-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-95"
                >
                  <Check on={done} />
                </button>
                <div className="min-w-0">
                  <div className={`truncate text-[14px] font-medium ${done ? "text-muted line-through" : "text-fg"}`}>{h.name}</div>
                  <div className="text-[12px] text-muted">
                    {h.streak > 0 ? `${h.streak}-day streak 🔥` : "Start today"}
                  </div>
                </div>
              </div>

              {h.kind === "count" && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`One fewer for ${h.name}`}
                    disabled={h.today === 0}
                    onClick={() => act("PUT", `/api/habits/${h.id}/log`, { value: Math.max(0, h.today - 1) })}
                    className="size-8 rounded-lg border border-line bg-surface2 text-sm transition-transform active:scale-95 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className={`w-10 text-center font-mono text-xs ${done ? "font-semibold text-good" : ""}`}>
                    {h.today}/{h.goal}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more for ${h.name}`}
                    onClick={() => act("PUT", `/api/habits/${h.id}/log`, { value: h.today + 1 })}
                    className="size-8 rounded-lg border border-line bg-surface2 text-sm transition-transform active:scale-95"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-line pt-2.5 text-right">
        <a href="#habits" className="text-xs font-medium text-accent-text hover:underline">
          View habit history →
        </a>
      </div>
    </Card>
  );
}
