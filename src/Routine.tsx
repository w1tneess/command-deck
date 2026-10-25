import { useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
import { AppleEmoji, AppleText, Btn, Card, H2 } from "./ui.tsx";
import { Schedule } from "./Schedule.tsx";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const istHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())) % 24;
const SLEEP = ["Poor", "Short", "OK", "Good", "Great"];

const ENERGY_SCALE = [
  { level: 1, energy: "low" as const, label: "1 - Drained" },
  { level: 2, energy: "low" as const, label: "2 - Low" },
  { level: 3, energy: "ok" as const, label: "3 - Normal" },
  { level: 4, energy: "high" as const, label: "4 - High" },
  { level: 5, energy: "high" as const, label: "5 - Peak" },
];

/** Unified chronological flow: 07:00 Morning Intent -> Deep Work Blocks -> 21:00 Evening Review */
export function DailyRoutineTimeline({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const big3 = state.targets.slice(0, 3);
  const todayFocusMins = state.sessions
    .filter((s) => s.day === state.today)
    .reduce((acc, s) => acc + s.minutes, 0);
  const cyclesDone = state.sessions.filter((s) => s.day === state.today).length;
  const topStreak = state.habits.reduce((max, h) => Math.max(max, h.streak), 0);

  return (
    <Card labelledBy="timeline-h" className="flex flex-col gap-4.5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400" />
          <h2 id="timeline-h" className="m-0 font-sans text-xs font-semibold tracking-tight text-white uppercase">
            Daily Routine Timeline
          </h2>
        </div>
        <span className="font-sans text-xs text-zinc-400">
          {r.shutdownAt ? (
            <span className="inline-flex items-center gap-1.5">
              <AppleEmoji emoji="🌙" size={13} />
              <span>Day Concluded</span>
            </span>
          ) : r.kickoffAt ? (
            <span className="inline-flex items-center gap-1.5">
              <AppleEmoji emoji="☀️" size={13} />
              <span>In Motion</span>
            </span>
          ) : (
            "Ready to Start"
          )}
        </span>
      </div>

      <div className="relative flex flex-col gap-6 pl-4 border-l border-white/[0.08] ml-2">
        {/* Step 1: Morning Intent (07:00) */}
        <div className="relative flex flex-col gap-2.5">
          <div className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-[#0e1117] bg-sky-400" />
          <div className="flex items-center justify-between">
            <span className="font-sans text-xs font-semibold text-sky-400 uppercase tracking-wider">
              01 · Morning Intent (07:00)
            </span>
            {r.kickoffAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-sans text-[11px] font-medium text-emerald-400">
                <AppleEmoji emoji="☀️" size={13} />
                <span>Started {clock(r.kickoffAt)}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => act("PUT", "/api/routine", { kickoff: true })}
                className="min-h-[32px] rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 font-sans text-[11px] font-medium text-white hover:bg-white/[0.08] transition-all cursor-pointer"
              >
                Start Day
              </button>
            )}
          </div>

          {/* Energy Calibration (1–5) */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-[#131720] p-2.5">
            <div className="flex items-center justify-between font-sans text-[11px] text-zinc-400">
              <span>Energy Calibration</span>
              <span className="text-zinc-200 font-medium">
                {state.checkin === "high" ? "Peak Focus (4–5)" : state.checkin === "low" ? "Light Review (1–2)" : "Normal (3)"}
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1">
              {ENERGY_SCALE.map((s) => {
                const active =
                  (s.level === 1 || s.level === 2) && state.checkin === "low" ? true
                  : s.level === 3 && state.checkin === "ok" ? true
                  : (s.level === 4 || s.level === 5) && state.checkin === "high" ? true
                  : false;
                return (
                  <button
                    key={s.level}
                    type="button"
                    aria-pressed={active}
                    onClick={() => act("POST", "/api/checkin", { energy: s.energy })}
                    className={`min-h-[32px] rounded-md font-sans text-xs font-medium transition-all ${
                      active ? "bg-white text-zinc-950 font-semibold shadow-xs" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    {s.level}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Energy-Aware Adaptation Protocol Banner */}
            {state.checkin === "low" && (
              <div className="mt-1 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200 animate-fade-in">
                <span className="shrink-0 pt-0.5">
                  <AppleEmoji emoji="⚠️" size={15} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-amber-300">Low Energy Protocol Active (1–2)</span>
                  <span className="text-[11px] text-amber-200/80 leading-relaxed">
                    High-intensity numerical chapters are flagged as <strong>[Needs Fresh Mind]</strong>. Study Queue reshuffled to prioritize formula revision, flashcard viva prep, and lighter theory.
                  </span>
                </div>
              </div>
            )}

            {state.checkin === "high" && (
              <div className="mt-1 flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-xs text-sky-200 animate-fade-in">
                <span className="shrink-0 pt-0.5">
                  <AppleEmoji emoji="⚡" size={15} />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold text-sky-300">Peak Energy Protocol Active (4–5)</span>
                  <span className="text-[11px] text-sky-200/80 leading-relaxed">
                    Heavy problem-solving and weak-spot numerical chapters (Maths, Physics, Chemistry) promoted to top priority for deep focus!
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sleep Quality */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-white/[0.06] bg-[#131720] p-2.5">
            <div className="flex items-center justify-between font-sans text-[11px] text-zinc-400">
              <span>Sleep Rating</span>
              {r.sleep && <span className="text-sky-400 font-medium">{SLEEP[r.sleep - 1]}</span>}
            </div>
            <div className="grid grid-cols-5 gap-1">
              {[1, 2, 3, 4, 5].map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-pressed={r.sleep === lvl}
                  onClick={() => act("PUT", "/api/routine", { sleep: r.sleep === lvl ? null : lvl })}
                  className={`min-h-[32px] rounded-md font-sans text-xs font-medium transition-all ${
                    r.sleep === lvl ? "bg-sky-400 text-zinc-950 font-semibold shadow-xs" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                  }`}
                >
                  {lvl}★
                </button>
              ))}
            </div>
          </div>

          {/* Big 3 Commitment */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between font-sans text-[11px] text-zinc-400">
              <span>Today's Big 3 Commitment</span>
              <span className="text-zinc-500 font-mono text-[10px]">2 Academic + 1 Personal</span>
            </div>
            {big3.length === 0 ? (
              <p className="m-0 rounded-lg border border-white/[0.06] bg-[#131720] p-2.5 font-sans text-xs text-zinc-500">
                No Big 3 selected yet. Add from Study Queue or Targets.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {big3.map((t, i) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2.5 rounded-lg border border-white/[0.06] bg-[#131720] p-2.5 transition-all"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <button
                        type="button"
                        aria-label={`Mark ${t.title} ${t.done ? "not done" : "done"}`}
                        onClick={() => act("PATCH", `/api/targets/${t.id}`, { done: !t.done })}
                        className="flex min-h-[36px] min-w-[36px] items-center justify-center p-0 border-0 bg-transparent active:scale-95 cursor-pointer"
                      >
                        <span className={`flex size-4.5 items-center justify-center rounded-md border transition-all text-[11px] ${t.done ? "border-emerald-500 bg-emerald-500 text-zinc-950 font-bold" : "border-white/[0.2] bg-white/[0.03] text-transparent"}`}>
                          {t.done && "✓"}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className={`truncate text-xs font-sans font-medium ${t.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                          {t.title}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-sans">
                          {i < 2 ? "Academic Priority" : "Personal / Health Needle"}
                        </div>
                      </div>
                    </div>
                    {t.done && <span className="font-sans text-[11px] text-emerald-400 font-medium">✓ Done</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Deep Work Blocks (10:00 - 18:00) */}
        <div className="relative flex flex-col gap-2">
          <div className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-[#0e1117] bg-indigo-400" />
          <div className="flex items-center justify-between">
            <span className="font-sans text-xs font-semibold text-indigo-400 uppercase tracking-wider">
              02 · Deep Work Blocks
            </span>
            <span className="font-mono text-xs text-zinc-300 font-semibold">
              {todayFocusMins >= 60 ? `${Math.floor(todayFocusMins / 60)}h ${todayFocusMins % 60}m` : `${todayFocusMins}m`} Logged
            </span>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#131720] p-3 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="font-sans text-zinc-200 font-medium">{cyclesDone} Pomodoro cycles complete</span>
              <span className="font-sans text-zinc-500 text-[11px]">
                {topStreak > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-400">
                    <AppleEmoji emoji="🔥" size={12} />
                    <span>Streak active: {topStreak} days</span>
                  </span>
                ) : (
                  "Focus mode ready"
                )}
              </span>
            </div>
            <a
              href="#today"
              className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 font-sans text-[11px] text-zinc-300 hover:text-white"
            >
              Focus View →
            </a>
          </div>
        </div>

        {/* Step 3: Evening Review (21:00) */}
        <div className="relative flex flex-col gap-2">
          <div className="absolute -left-[21px] top-1 size-2.5 rounded-full border-2 border-[#0e1117] bg-purple-400" />
          <span className="font-sans text-xs font-semibold text-purple-400 uppercase tracking-wider">
            03 · Evening Review (21:00)
          </span>
          <Evening state={state} act={act} />
        </div>
      </div>
    </Card>
  );
}

/** Plan the day: rate last night's sleep, see the Big 3, and mark the day as started. */
export function Morning({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const big3 = state.targets.slice(0, 3);
  return (
    <Card labelledBy="morning-h">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <H2 id="morning-h">Morning Kickoff</H2>
        {r.kickoffAt && (
          <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-sans text-[11px] font-medium text-emerald-400">
            Started at {clock(r.kickoffAt)}
          </span>
        )}
      </div>
      <div className="mt-4" role="group" aria-labelledby="sleep-h">
        <div id="sleep-h" className="mb-2 font-sans text-xs text-zinc-400">Sleep Quality Rating</div>
        <div className="flex gap-1 rounded-lg bg-[#131720] p-1 border border-white/[0.06]">
          {SLEEP.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={r.sleep === i + 1}
              aria-label={`Sleep ${i + 1} of 5, ${label}`}
              onClick={() => act("PUT", "/api/routine", { sleep: r.sleep === i + 1 ? null : i + 1 })}
              className={`min-h-[34px] flex-1 rounded-md font-sans text-xs font-medium transition-all ${
                r.sleep === i + 1
                  ? "bg-white text-zinc-950 font-semibold shadow-xs"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <span>{i + 1}</span>
              <span className="ml-1 hidden text-[10px] sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between font-sans text-xs text-zinc-300">
          <div>The Big 3 Non-Negotiables</div>
          <span className="text-zinc-500 text-[10px]">2 Academic + 1 Personal</span>
        </div>
        {big3.length === 0 ? (
          <p className="m-0 font-sans text-xs text-zinc-400 rounded-lg bg-[#131720] p-3 border border-white/[0.06]">No targets initialized yet.</p>
        ) : (
          <ol className="m-0 list-none p-0 flex flex-col gap-1.5">
            {big3.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2.5 rounded-lg bg-[#131720] px-3 py-2 border border-white/[0.06]">
                <span className="flex size-5 items-center justify-center rounded-md bg-white/[0.08] font-mono text-[10px] font-semibold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-xs font-sans font-medium ${t.done ? "text-zinc-500 line-through" : "text-white"}`}>{t.title}</div>
                  <div className="text-[10px] font-sans text-zinc-500">
                    {i < 2 ? "Academic Priority" : "Personal / Health Needle"}
                  </div>
                </div>
                {t.done && <span className="font-sans text-[11px] font-medium text-emerald-400">✓ Done</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-4">
        {r.kickoffAt ? (
          <Btn kind="ghost" className="px-0" onClick={() => act("PUT", "/api/routine", { kickoff: false })}>
            Undo kickoff
          </Btn>
        ) : (
          <Btn kind="primary" onClick={() => act("PUT", "/api/routine", { kickoff: true })}>
            Start the day
          </Btn>
        )}
      </div>
    </Card>
  );
}

/** Close the day: wins, prep for tomorrow, and a shutdown stamp. Compact collapsible card. */
export function Evening({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const uid = useId();
  const winsId = `${uid}-wins`;
  const tomorrowId = `${uid}-tomorrow`;
  const [open, setOpen] = useState(() => istHour() >= 17 || !!r.shutdownAt);
  const [wins, setWins] = useState(r.wins);
  const [tomorrow, setTomorrow] = useState(r.tomorrow);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const busy = useRef(false);
  const doneTargets = state.targets.filter((t) => t.done).length;
  const doneHabits = state.habits.filter((h) => h.today >= h.goal).length;

  const save = async (field: "wins" | "tomorrow", value: string) => {
    const trimmed = value.trim();
    if (busy.current || !hasUserEdited || trimmed === r[field]) return;
    busy.current = true;
    try {
      await act("PUT", "/api/routine", { [field]: trimmed });
    } finally {
      busy.current = false;
    }
  };

  const handleShutdown = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await act("PUT", "/api/routine", { wins, tomorrow, shutdown: !r.shutdownAt });
    } finally {
      busy.current = false;
    }
  };

  return (
    <Card labelledBy="evening-h">
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)} className="group">
        <summary className="flex min-h-9 cursor-pointer flex-wrap items-center justify-between gap-2.5 list-none">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-[1px] ${r.shutdownAt ? "bg-emerald-400" : "bg-indigo-400"}`} />
            <span id="evening-h" className="font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-300 uppercase">
              EVENING // SHUTDOWN
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-zinc-300">
              {r.shutdownAt ? (
                <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-bold text-emerald-400 uppercase">
                  <AppleEmoji emoji="🌙" size={12} />
                  <span>Shut down {clock(r.shutdownAt)}</span>
                </span>
              ) : (
                `${doneTargets}/${state.targets.length} targets · ${doneHabits}/${state.habits.length} habits`
              )}
            </span>
            <span className="font-mono text-xs text-zinc-400 transition-transform duration-200 group-open:rotate-180">▼</span>
          </div>
        </summary>
        <div className="mt-3 flex flex-col gap-3 pt-2.5 border-t border-white/[0.08]">
          <div className="flex flex-col gap-1">
            <label htmlFor={winsId} className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">Today's Key Wins & Mastered Topics</label>
            <textarea
              id={winsId}
              rows={2}
              maxLength={1000}
              value={wins}
              placeholder="What went well today? What concepts clicked?"
              onChange={(e) => {
                setWins(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => void save("wins", wins)}
              className="w-full resize-none rounded-[2px] border border-white/[0.12] bg-[#141724] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-sky-400 transition-all placeholder:text-zinc-500 leading-relaxed"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={tomorrowId} className="font-mono text-[10px] uppercase tracking-wider text-zinc-300">Preparation for Tomorrow</label>
            <textarea
              id={tomorrowId}
              rows={2}
              maxLength={1000}
              value={tomorrow}
              placeholder="What's your primary focus session tomorrow?"
              onChange={(e) => {
                setTomorrow(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => void save("tomorrow", tomorrow)}
              className="w-full resize-none rounded-[2px] border border-white/[0.12] bg-[#141724] px-3 py-2 font-mono text-xs text-zinc-100 focus:border-sky-400 transition-all placeholder:text-zinc-500 leading-relaxed"
            />
          </div>
          <div className="pt-0.5">
            {r.shutdownAt ? (
              <Btn kind="ghost" className="px-0 font-mono text-xs" onClick={handleShutdown}>
                Undo shutdown
              </Btn>
            ) : (
              <button
                type="button"
                onClick={handleShutdown}
                className="h-8 w-full rounded-[2px] border border-transparent bg-white hover:bg-zinc-100 text-zinc-950 font-mono text-xs uppercase font-bold tracking-wider active:scale-[0.99] transition-all shadow-xs"
              >
                Shut down for the day
              </button>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}

export function Routine({ state, act }: { state: State; act: Act }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full">
      <Morning state={state} act={act} />
      <Schedule state={state} act={act} onStartFocus={() => act("POST", "/api/timer/start")} />
      <DailyRoutineTimeline state={state} act={act} />
      <Evening key={state.routine.day} state={state} act={act} />
    </div>
  );
}

