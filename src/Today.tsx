import { useId, useRef, useState } from "react";
import { ENERGIES, type Energy } from "../server/planner.ts";
import type { Act, Chapter, Phase, State, Subject } from "./api.ts";
import { FocusCard, type FocusModel } from "./Focus.tsx";
import { activeOf, chapterIndex, reasonFor, studyQueueFor, whenOf } from "./model.ts";
import { Evening, Morning } from "./Routine.tsx";
import { Btn, Card, Check, ConfDots, H2, PassPills, Pill, daysBetween, fmtLong, fmtShort, fmtWeekdayDate } from "./ui.tsx";
import { VivaDrawer } from "./VivaDrawer.tsx";

const ENERGY_LABEL: Record<Energy, string> = { low: "Low", ok: "OK", high: "High" };
const ENERGY_NOTE = "Low puts lighter chapters first. High puts the hardest first.";

export function Today({
  state,
  act,
  focus,
  onOpenZen,
}: {
  state: State;
  act: Act;
  focus: FocusModel;
  onOpenZen?: () => void;
}) {
  const [viva, setViva] = useState<{ chapter: Chapter; subject: Subject } | null>(null);

  return (
    <>
      <Header state={state} act={act} />
      <Hero state={state} act={act} />

      {/* Energy-Aware Adaptive Schedule Alert */}
      {state.checkin === "low" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-cyan-950/25 p-4 text-cyan-200 backdrop-blur-md shadow-xs animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="flex size-7 items-center justify-center rounded-xl bg-cyan-500/20 text-base text-cyan-300">
              ⚡
            </span>
            <div className="text-xs leading-relaxed">
              <span className="font-semibold uppercase font-mono tracking-wider text-cyan-300">
                Low Energy Protocol Active:
              </span>{" "}
              <span>
                Schedule recommendations automatically adapted to prioritize lighter revision chapters (Pass 1 concept notes & recall) over heavy problem-solving sets.
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => act("POST", "/api/checkin", { energy: "ok" })}
            className="shrink-0 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 font-mono text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 active:scale-95 transition-all"
          >
            Reset to Standard
          </button>
        </div>
      )}

      <DailyMomentum state={state} focus={focus} />

      <div className="flex flex-wrap items-start gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-4 lg:gap-6">
          <Morning state={state} act={act} />
          <Targets
            state={state}
            act={act}
            focus={focus}
            onOpenViva={(c, s) => setViva({ chapter: c, subject: s })}
          />
          <Queue
            state={state}
            act={act}
            onOpenViva={(c, s) => setViva({ chapter: c, subject: s })}
          />
          <Evening key={state.routine.day} state={state} act={act} />
        </div>

        {/* On a phone this column holds energy & quick habits, which sit above the targets. */}
        <div className="order-first flex min-w-0 flex-[2_1_320px] flex-col gap-4 lg:order-none lg:gap-6">
          <div className="hidden lg:block">
            <FocusCard focus={focus} state={state} onOpenZen={onOpenZen} />
          </div>
          <Energy state={state} act={act} />
          <DailyHabitsWidget state={state} act={act} />
        </div>
      </div>

      {/* Quick Viva & Active Recall Drawer */}
      {viva && (
        <VivaDrawer
          chapter={viva.chapter}
          subject={viva.subject}
          act={act}
          onClose={() => setViva(null)}
        />
      )}
    </>
  );
}

function Header({ state, act }: { state: State; act: Act }) {
  const upcoming = state.phases.find((p) => state.today <= p.endsOn) ?? activeOf(state);
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 font-mono text-xs text-muted">
          <span className="inline-flex size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
          <span className="uppercase tracking-widest">{fmtWeekdayDate(state.today)}</span>
          <span className="text-line-strong">/</span>
          <span className="text-accent-text font-semibold">IST TELEMETRY</span>
        </div>
        <h1 className="m-0 text-[32px] sm:text-[36px] font-bold tracking-tight text-fg">
          Mission Control
        </h1>
      </div>
      <label className="flex items-center gap-2.5">
        <span className="hidden font-mono text-xs font-semibold uppercase tracking-wider text-muted lg:inline">Phase Protocol:</span>
        <select
          aria-label="Phase"
          title={state.autoPhase ? "Following the calendar" : "Chosen by you"}
          value={state.autoPhase ? "auto" : (state.activePhaseId ?? "auto")}
          onChange={(e) => act("PUT", "/api/active-phase", { phaseId: e.target.value === "auto" ? null : e.target.value })}
          className="h-10 rounded-xl border border-line/90 bg-surface2/80 px-3.5 font-mono text-xs font-medium text-fg shadow-xs transition-colors hover:border-line-strong lg:h-11 lg:px-4 lg:text-[13px]"
        >
          <option value="auto">Auto-Track: {upcoming.name}</option>
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
  const big = over ? "Over" : String(started ? Math.max(0, daysTo(state.today, phase)) : phase.daysLeft);
  const unit = over ? "Completed" : started ? "days remaining" : "days until kickoff";

  // Calculate elapsed percentage within phase
  const totalDays = Math.max(1, daysBetween(phase.startsOn, phase.endsOn));
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(phase.startsOn, state.today)));
  const phasePct = Math.round((elapsedDays / totalDays) * 100);

  return (
    <section
      aria-label="Countdown telemetry"
      className="telemetry-grid relative overflow-hidden flex flex-wrap items-stretch justify-between gap-6 rounded-[26px] border border-white/10 bg-[#090b10] p-6 text-white shadow-[0_20px_50px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)] lg:rounded-[28px] lg:p-8"
    >
      {/* Precision corner vignette and ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-accent/10 via-transparent to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/15 blur-3xl" />

      {/* Main Mission Display */}
      <div className="relative z-10 flex min-w-[260px] flex-1 flex-col justify-between gap-6">
        {/* Top telemetry header */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-md">
            <span className="size-2 rounded-full bg-good shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
            <span>ACTIVE ORBIT · {phase.name}</span>
          </div>
          <span className="font-mono text-xs text-white/50">
            {phase.confirmed ? "CONFIRMED DATES" : "APPROXIMATE SCHEDULE"}
          </span>
          <span className="ml-auto hidden font-mono text-xs text-white/40 xl:inline">
            COORDINATES: IST (UTC+5:30)
          </span>
        </div>

        {/* Big countdown lockup */}
        <div className="flex flex-col gap-1.5 my-1">
          <div className="flex items-baseline gap-4">
            <span className="font-mono text-[76px] sm:text-[92px] lg:text-[108px] font-bold leading-none tracking-tighter tabular-nums drop-shadow-[0_4px_30px_rgba(255,255,255,0.15)] text-white">
              {big}
            </span>
            <div className="flex flex-col">
              <span className="font-mono text-sm sm:text-base font-semibold uppercase tracking-widest text-accent-text">
                {unit}
              </span>
              <span className="font-mono text-xs text-white/60">
                {fmtShort(phase.startsOn)} → {fmtLong(phase.endsOn)}
              </span>
            </div>
          </div>
        </div>

        {/* Precision laser progress rail */}
        <div className="flex flex-col gap-2 max-w-xl">
          <div className="flex items-center justify-between font-mono text-xs text-white/60">
            <span className="uppercase tracking-wider">TIMELINE ELAPSED</span>
            <span className="text-white/90 font-semibold">{phasePct}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10 border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-accent via-[#818cf8] to-good transition-all duration-500 ease-out shadow-[0_0_12px_rgba(99,102,241,0.8)]"
              style={{ width: `${phasePct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-white/40">
            <span>START: {fmtShort(phase.startsOn)}</span>
            <span>END: {fmtShort(phase.endsOn)}</span>
          </div>
        </div>
      </div>

      {/* Flight roster on Desktop */}
      <div className="relative z-10 hidden min-w-[280px] flex-[0_0_320px] flex-col justify-between border-l border-white/10 pl-6 lg:flex">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-white/60">Phase Matrix</span>
          <span className="font-mono text-[11px] text-white/40">{state.phases.length} Phases</span>
        </div>
        <ol className="m-0 list-none flex flex-col gap-2 p-0 py-3">
          {state.phases.map((p: Phase) => {
            const isActive = p.id === phase.id;
            return (
              <li
                key={p.id}
                aria-current={isActive ? "true" : undefined}
                onClick={() => {
                  if (!isActive) void act("PUT", "/api/active-phase", { phaseId: p.id });
                }}
                className={`group flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-200 ${
                  isActive
                    ? "border border-accent/40 bg-accent/20 text-white shadow-[0_0_16px_rgba(99,102,241,0.25),inset_0_1px_0_rgba(255,255,255,0.15)] font-semibold"
                    : "border border-transparent bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`size-1.5 rounded-full ${isActive ? "bg-good shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-white/30"}`} />
                  <span className="text-[13.5px]">{p.name}</span>
                </div>
                <span className="font-mono text-xs text-white/50 group-hover:text-white/80">{whenOf(p)}</span>
              </li>
            );
          })}
        </ol>
        <div className="pt-2 text-[11px] font-mono text-white/40 text-right">
          CLICK TO HOT-SWAP PHASE
        </div>
      </div>
    </section>
  );
}

/** Glanceable telemetry cards summarizing today's key study metrics and concentric focus session rings. */
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
      {/* 01 / Targets */}
      <div className="group relative overflow-hidden flex flex-col justify-between rounded-[22px] border border-line/80 bg-surface/85 backdrop-blur-xl p-4 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-line-strong hover:bg-surface2/60 transition-all duration-200 lg:p-5">
        <div className="flex items-center justify-between text-muted">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted group-hover:text-fg transition-colors">01 / TARGETS</span>
          <span className="font-mono text-xs font-semibold text-accent-text">{targetPct}%</span>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-bold tracking-tight text-fg lg:text-4xl">{doneTargets}</span>
          <span className="font-mono text-xs text-muted">/ {totalTargets}</span>
        </div>
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface3/60 border border-line/40">
          <div className="h-full bg-gradient-to-r from-accent to-accent-text transition-all duration-300 ease-out shadow-[0_0_8px_rgba(99,102,241,0.5)]" style={{ width: `${targetPct}%` }} />
        </div>
      </div>

      {/* 02 / Focus Time with Concentric Visual Session Rings */}
      <div className="group relative overflow-hidden flex flex-col justify-between rounded-[22px] border border-line/80 bg-surface/85 backdrop-blur-xl p-4 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-line-strong hover:bg-surface2/60 transition-all duration-200 lg:p-5">
        <div className="flex items-center justify-between text-muted">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted group-hover:text-fg transition-colors">02 / FOCUS ENGINE</span>
          {focus.running && <span className="flex size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" title="Focus session running" />}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-3xl font-bold tracking-tight text-fg lg:text-4xl">
              {todayFocusMins >= 60 ? `${Math.floor(todayFocusMins / 60)}h ${todayFocusMins % 60}m` : `${todayFocusMins}m`}
            </span>
          </div>
          {/* Animated concentric session rings: 90m (inner), 180m (mid), 240m (outer) */}
          <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90 shrink-0" aria-label="Visual session rings: 90m, 180m, 240m daily targets">
            {/* 90m ring (r=11) */}
            <circle cx="22" cy="22" r="11" fill="none" stroke="var(--line)" strokeWidth="2.5" opacity="0.4" />
            <circle cx="22" cy="22" r="11" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray={2 * Math.PI * 11} strokeDashoffset={2 * Math.PI * 11 * (1 - Math.min(1, todayFocusMins / 90))} strokeLinecap="round" />
            {/* 180m ring (r=15) */}
            <circle cx="22" cy="22" r="15" fill="none" stroke="var(--line)" strokeWidth="2.5" opacity="0.4" />
            <circle cx="22" cy="22" r="15" fill="none" stroke="#818cf8" strokeWidth="2.5" strokeDasharray={2 * Math.PI * 15} strokeDashoffset={2 * Math.PI * 15 * (1 - Math.min(1, todayFocusMins / 180))} strokeLinecap="round" />
            {/* 240m ring (r=19) */}
            <circle cx="22" cy="22" r="19" fill="none" stroke="var(--line)" strokeWidth="2.5" opacity="0.4" />
            <circle cx="22" cy="22" r="19" fill="none" stroke="var(--good)" strokeWidth="2.5" strokeDasharray={2 * Math.PI * 19} strokeDashoffset={2 * Math.PI * 19 * (1 - Math.min(1, todayFocusMins / 240))} strokeLinecap="round" />
          </svg>
        </div>
        <span className="mt-2.5 truncate text-xs text-muted font-medium">
          {focus.running ? `${focus.label} running` : `${state.sessions.filter((s) => s.day === state.today).length} cycles completed`}
        </span>
      </div>

      {/* 03 / Habits */}
      <div className="group relative overflow-hidden flex flex-col justify-between rounded-[22px] border border-line/80 bg-surface/85 backdrop-blur-xl p-4 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-line-strong hover:bg-surface2/60 transition-all duration-200 lg:p-5">
        <div className="flex items-center justify-between text-muted">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted group-hover:text-fg transition-colors">03 / HABIT PROTOCOL</span>
          <span className="font-mono text-xs text-good font-semibold">{doneHabits === totalHabits && totalHabits > 0 ? "ALL CLEAR" : ""}</span>
        </div>
        <div className="mt-3 flex items-baseline gap-1.5">
          <span className="font-mono text-3xl font-bold tracking-tight text-fg lg:text-4xl">{doneHabits}</span>
          <span className="font-mono text-xs text-muted">/ {totalHabits}</span>
        </div>
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-surface3/60 border border-line/40">
          <div className="h-full bg-good transition-all duration-300 ease-out shadow-[0_0_8px_rgba(52,211,153,0.5)]" style={{ width: `${totalHabits > 0 ? (doneHabits / totalHabits) * 100 : 0}%` }} />
        </div>
      </div>

      {/* 04 / Routine */}
      <div className="group relative overflow-hidden flex flex-col justify-between rounded-[22px] border border-line/80 bg-surface/85 backdrop-blur-xl p-4 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-line-strong hover:bg-surface2/60 transition-all duration-200 lg:p-5">
        <div className="flex items-center justify-between text-muted">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-muted group-hover:text-fg transition-colors">04 / SYSTEM STATE</span>
          {state.routine.sleep ? <span className="font-mono text-xs text-accent-text font-semibold">{state.routine.sleep}/5 SLEEP</span> : null}
        </div>
        <div className="mt-3">
          <div className="truncate text-base font-semibold text-fg lg:text-lg">
            {state.routine.shutdownAt ? "Shut down" : state.routine.kickoffAt ? "Active cycle" : "Standby"}
          </div>
        </div>
        <span className="mt-3.5 truncate text-xs text-muted font-medium">
          {state.checkin ? `Energy: ${ENERGY_LABEL[state.checkin]}` : "Check-in pending"}
        </span>
      </div>
    </section>
  );
}

/** Days left in a phase that has already begun. */
const daysTo = (today: string, p: Phase) => Math.round((Date.parse(p.endsOn) - Date.parse(today)) / 86_400_000);

function Targets({
  state,
  act,
  focus,
  onOpenViva,
}: {
  state: State;
  act: Act;
  focus: FocusModel;
  onOpenViva: (c: Chapter, s: Subject) => void;
}) {
  const index = chapterIndex(state);
  const [adding, setAdding] = useState(false);
  const done = state.targets.filter((t) => t.done).length;
  const allDone = done > 0 && done === state.targets.length;

  return (
    <Card labelledBy="targets-h">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <H2 id="targets-h">Daily targets</H2>
          <span className="font-mono text-[12px] font-semibold text-muted tracking-wider uppercase">
            [ {done} / {state.targets.length} COMPLETE ]
          </span>
        </div>
        <Btn kind={adding ? "secondary" : "primary"} aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add target"}
        </Btn>
      </div>

      {/* Continuous progress indicator */}
      {state.targets.length > 0 && (
        <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface3/60 border border-line/40">
          <div
            className={`h-full transition-all duration-500 ease-out ${allDone ? "bg-good shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "bg-gradient-to-r from-accent to-accent-text shadow-[0_0_8px_rgba(99,102,241,0.6)]"}`}
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

      <div className="flex flex-col gap-2">
        {state.targets.map((t, idx) => {
          const hit = t.chapterId ? index.get(t.chapterId) : undefined;
          const subjectId = hit ? hit.subject.id : t.subjectId;
          const subjectName = hit ? hit.subject.name : undefined;
          const needleRole = idx === 0 || idx === 1 ? "Big 3 · Academic" : idx === 2 ? "Big 3 · Personal" : undefined;
          const isLightWork = hit ? hit.chapter.confidence >= 3 || !!hit.chapter.passes[0] : false;

          return (
            <TargetRow
              key={t.id}
              id={t.id}
              done={t.done}
              name={hit ? hit.chapter.name : t.title}
              sub={hit ? reasonFor(hit.chapter) : "Custom target"}
              subject={subjectName}
              needleRole={needleRole}
              isLightWork={isLightWork}
              swappable={!!t.chapterId && !t.done}
              act={act}
              onViva={hit ? () => onOpenViva(hit.chapter, hit.subject) : undefined}
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
      </div>

      <div className="mt-3 border-t border-line/60 pt-3 text-[13px] text-muted">
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
  subject,
  needleRole,
  isLightWork,
  swappable,
  act,
  onFocus,
  onViva,
}: {
  id: number;
  done: boolean;
  name: string;
  sub: string;
  subject?: string;
  needleRole?: string;
  isLightWork?: boolean;
  swappable: boolean;
  act: Act;
  onFocus?: () => void;
  onViva?: () => void;
}) {
  const [more, setMore] = useState(false);
  return (
    <div
      className={`group relative flex flex-wrap items-center gap-3 rounded-2xl border px-3.5 py-3 transition-all duration-200 ${
        done
          ? "border-line/40 bg-surface2/25 opacity-70"
          : "border-line/70 bg-surface2/45 hover:border-line-strong hover:bg-surface2/75 hover:shadow-[0_4px_16px_rgba(0,0,0,0.14)]"
      }`}
    >
      <button
        type="button"
        aria-label={`${done ? "Mark not done" : "Mark done"}: ${name}`}
        aria-pressed={done}
        onClick={() => act("PATCH", `/api/targets/${id}`, { done: !done })}
        className="flex size-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
      >
        <Check on={done} />
      </button>

      <div className="min-w-0 flex-1 basis-[180px]">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[15px] font-medium leading-snug transition-colors ${done ? "text-muted line-through" : "text-fg"}`}>{name}</span>
          {subject && (
            <span className="rounded-md bg-accent/10 border border-accent/25 px-2 py-0.5 font-mono text-[11px] font-semibold text-accent-text uppercase tracking-wider">
              {subject}
            </span>
          )}
          {needleRole && !done && (
            <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider ${
              needleRole.includes("Academic")
                ? "border-accent/30 bg-accent/10 text-accent-text"
                : "border-good/30 bg-good/10 text-good"
            }`}>
              {needleRole}
            </span>
          )}
          {isLightWork && !done && (
            <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
              🍃 Light Revision
            </span>
          )}
        </div>
        <div className="text-xs text-muted mt-0.5">{sub}</div>
      </div>

      <div className="flex items-center gap-2">
        {onViva && !done && (
          <button
            type="button"
            title="Open quick recall & viva prep"
            onClick={onViva}
            className="inline-flex h-8 items-center gap-1 rounded-xl border border-accent/40 bg-accent/15 px-2.5 font-mono text-xs font-semibold text-accent-text transition-all hover:bg-accent/25 active:scale-95 shadow-2xs"
          >
            ⚡ Viva
          </button>
        )}

        {onFocus && !done && (
          <button
            type="button"
            title="Start focus timer on this subject"
            onClick={onFocus}
            className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/15 px-3 text-xs font-semibold text-accent-text transition-all hover:bg-accent hover:text-white hover:shadow-[0_0_12px_rgba(99,102,241,0.4)] active:scale-95"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
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
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:text-fg hover:bg-surface3/40 lg:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>

        <div className={`${more ? "flex basis-full justify-end pt-1" : "hidden"} gap-1.5 lg:flex lg:basis-auto`}>
          {swappable && (
            <Btn kind="ghost" className="h-8 px-2.5 text-xs hover:bg-surface3/60" onClick={() => act("POST", `/api/targets/${id}/swap`)}>
              Swap
            </Btn>
          )}
          <Btn kind="ghost" className="h-8 px-2.5 text-xs text-muted hover:text-warn hover:bg-surface3/60" aria-label={`Remove ${name}`} onClick={() => act("DELETE", `/api/targets/${id}`)}>
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
    <form className="mb-3 flex flex-wrap items-end gap-3 border-t border-line/60 py-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label htmlFor={chapterIdKey} className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-medium text-muted">
        Chapter from syllabus
        <select
          id={chapterIdKey}
          value={chapterId}
          disabled={saving || !!text.trim()}
          onChange={(e) => setChapterId(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface2/60 px-3.5 text-[15px] text-fg disabled:opacity-50 focus:border-accent focus:bg-surface2 transition-all"
        >
          <option value="">Pick a chapter</option>
          {state.subjects.filter((s) => s.chapters.length).map((s) => (
            <optgroup key={s.id} label={s.name}>
              {s.chapters.filter((c) => !planned.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label htmlFor={textIdKey} className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] font-medium text-muted">
        Or write your own
        <input
          id={textIdKey}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Finish the Maths lab file"
          disabled={saving || !!chapterId}
          className="h-11 rounded-xl border border-line bg-surface2/60 px-3.5 text-[15px] text-fg disabled:opacity-50 focus:border-accent focus:bg-surface2 transition-all placeholder:text-muted/60"
        />
      </label>
      <Btn type="submit" kind="primary" disabled={saving || (!chapterId && !text.trim())}>
        {saving ? "Adding…" : "Add target"}
      </Btn>
    </form>
  );
}

function Queue({
  state,
  act,
  onOpenViva,
}: {
  state: State;
  act: Act;
  onOpenViva: (c: Chapter, s: Subject) => void;
}) {
  const picks = studyQueueFor(state);
  const phase = activeOf(state);
  const over = state.today > phase.endsOn;
  const plannedSet = new Set(state.targets.map((t) => t.chapterId).filter(Boolean));
  const canPlanMore = state.targets.length < 8;

  return (
    <Card labelledBy="queue-h">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <H2 id="queue-h">Study Queue</H2>
          <span className="font-mono text-xs text-muted">RANKED BY CONFIDENCE & EXAM SCHEDULE</span>
        </div>
        <span className="font-mono text-xs text-muted">
          ENERGY: <span className="font-semibold text-accent-text uppercase">{ENERGY_LABEL[state.checkin ?? "ok"]}</span>
        </span>
      </div>

      {picks.length === 0 ? (
        <p className="m-0 border-t border-line/60 py-4 text-[14px] text-muted">
          {over ? "This phase is over. Switch phase above to plan the next one." : "Nothing left in scope. Add chapters under Syllabus, or switch phase."}
        </p>
      ) : (
        <div className="flex flex-col gap-2 pt-1">
          {picks.map((q, i) => {
            const isPlanned = plannedSet.has(q.chapterId);
            const isLightWork = q.chapter.confidence >= 3 || !!q.chapter.passes[0];

            return (
              <div
                key={q.chapterId}
                className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line/60 bg-surface2/40 p-3.5 transition-all hover:border-line-strong hover:bg-surface2/75 hover:shadow-[0_2px_12px_rgba(0,0,0,0.12)]"
              >
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-surface3/60 font-mono text-xs font-semibold text-muted transition-colors group-hover:bg-accent/15 group-hover:text-accent-text">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium leading-snug">{q.chapter.name}</div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Pill>{q.subject.name}</Pill>
                      <ConfDots value={q.chapter.confidence} />
                      {isLightWork ? (
                        <span className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.2 font-mono text-[10px] text-cyan-300">
                          🍃 Light Revision
                        </span>
                      ) : (
                        <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 font-mono text-[10px] text-amber-400">
                          🔥 Deep Focus
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    title="Quick Viva and Active Recall"
                    onClick={() => onOpenViva(q.chapter, q.subject)}
                    className="inline-flex h-8 items-center gap-1 rounded-xl border border-accent/40 bg-accent/15 px-2.5 font-mono text-xs font-semibold text-accent-text hover:bg-accent/25 transition-all active:scale-95 shadow-2xs"
                  >
                    ⚡ Viva
                  </button>

                  <PassPills passes={q.chapter.passes} />

                  {isPlanned ? (
                    <span className="inline-flex items-center gap-1 rounded-xl border border-good/40 bg-good/10 px-3 py-1.5 text-xs font-medium text-good shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      <span>✓</span> Planned
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={!canPlanMore}
                      title={canPlanMore ? "Add to today's daily targets" : "Daily targets limit reached (max 8)"}
                      onClick={() => act("POST", "/api/targets", { chapterId: q.chapterId })}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-line bg-surface2/90 px-3 text-xs font-medium text-fg transition-all hover:border-accent hover:bg-surface3 hover:text-accent-text active:scale-95 disabled:opacity-40"
                    >
                      <span className="text-[13px] font-bold">+</span> Plan today
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function Energy({ state, act }: { state: State; act: Act }) {
  return (
    <section aria-label="Energy check-in" className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3.5 lg:rounded-[24px] lg:border lg:border-line/80 lg:bg-surface/85 lg:backdrop-blur-xl lg:px-6 lg:py-5.5 lg:shadow-[0_4px_24px_-1px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="hidden lg:flex items-center justify-between">
        <h2 className="m-0 text-[16px] font-semibold tracking-[-0.015em]">Energy Calibration</h2>
        <span className="font-mono text-[11px] text-muted uppercase">SYSTEM PROTOCOL</span>
      </div>
      <span className="w-[52px] text-[13px] text-muted lg:hidden">Energy</span>
      <div className="flex flex-1 gap-1.5 rounded-xl bg-surface2/60 p-1 border border-line/60" role="group" aria-label="Energy today">
        {ENERGIES.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={state.checkin === e}
            onClick={() => act("POST", "/api/checkin", { energy: e })}
            className={`h-10 flex-1 rounded-[10px] text-[13.5px] font-medium transition-all duration-150 ${
              state.checkin === e
                ? "bg-gradient-to-b from-[#6366f1] to-[#4f46e5] text-white shadow-[0_2px_12px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.2)] font-semibold"
                : "text-muted hover:text-fg hover:bg-surface3/50"
            }`}
          >
            {ENERGY_LABEL[e]}
          </button>
        ))}
      </div>
      <p className="m-0 hidden text-[13px] text-muted lg:block leading-relaxed">{ENERGY_NOTE}</p>
    </section>
  );
}

/** Compact habits check-off widget directly in the Today command center. */
function DailyHabitsWidget({ state, act }: { state: State; act: Act }) {
  if (state.habits.length === 0) return null;
  const doneToday = state.habits.filter((h) => h.today >= h.goal).length;

  return (
    <Card labelledBy="today-habits-h">
      <div className="mb-3 flex items-baseline justify-between">
        <H2 id="today-habits-h">Today's Habits</H2>
        <span className="rounded-full border border-line/60 bg-surface2/80 px-2.5 py-0.5 font-mono text-xs font-medium text-muted">
          {doneToday} of {state.habits.length} done
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {state.habits.map((h) => {
          const done = h.today >= h.goal;
          return (
            <div
              key={h.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-3 transition-all ${
                done
                  ? "border-line/40 bg-surface2/25 opacity-80"
                  : "border-line/60 bg-surface2/45 hover:border-line-strong hover:bg-surface2/75 hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]"
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={done}
                  aria-label={`${h.name}: ${done ? "done" : "not done"}`}
                  onClick={() => act("PUT", `/api/habits/${h.id}/log`, { value: done ? 0 : h.goal })}
                  className="flex size-9 shrink-0 items-center justify-center border-0 bg-transparent p-0 transition-transform active:scale-90"
                >
                  <Check on={done} />
                </button>
                <div className="min-w-0">
                  <div className={`truncate text-[14.5px] font-medium leading-snug ${done ? "text-muted line-through" : "text-fg"}`}>{h.name}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    {h.streak > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.2 font-medium text-amber-500 dark:text-amber-400">
                        🔥 {h.streak}d streak
                      </span>
                    ) : (
                      <span>Start today</span>
                    )}
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
                    className="flex size-8 items-center justify-center rounded-xl border border-line bg-surface2 text-sm font-semibold transition-all hover:bg-surface3 active:scale-95 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className={`w-10 text-center font-mono text-xs ${done ? "font-semibold text-good" : "text-muted"}`}>
                    {h.today}/{h.goal}
                  </span>
                  <button
                    type="button"
                    aria-label={`One more for ${h.name}`}
                    onClick={() => act("PUT", `/api/habits/${h.id}/log`, { value: h.today + 1 })}
                    className="flex size-8 items-center justify-center rounded-xl border border-line bg-surface2 text-sm font-semibold transition-all hover:bg-surface3 active:scale-95"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 border-t border-line/60 pt-3 text-right">
        <a href="#habits" className="text-xs font-medium text-accent-text hover:underline">
          View habit history →
        </a>
      </div>
    </Card>
  );
}
