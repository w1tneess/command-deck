import { useEffect, useId, useRef, useState } from "react";
import type { Act, Habit, State } from "./api.ts";
import { Btn, Card, Check, H2 } from "./ui.tsx";

const LETTER = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const at = (day: string) => Date.parse(day + "T00:00:00Z");
const DAY = 86_400_000;

export function Habits({ state, act }: { state: State; act: Act }) {
  const [adding, setAdding] = useState(false);
  const doneToday = state.habits.filter((h) => h.today >= h.goal).length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.today, i - 6));

  // Habit consistency calculation over the last 30 days
  const last30Days = state.habitDays.slice(-30);
  const totalHabits30 = state.habits.length * 30;
  const doneHabits30 = last30Days.reduce((acc, d) => acc + d.done, 0);
  const consistencyPct = totalHabits30 > 0 ? Math.round((doneHabits30 / totalHabits30) * 100) : 0;

  // Max streak across all habits
  const topStreak = state.habits.reduce((max, h) => Math.max(max, h.streak), 0);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="inline-flex size-2 rounded-full bg-good animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            <span className="uppercase tracking-widest">LIFE OS PROTOCOL</span>
            <span className="text-line-strong">/</span>
            <span className="text-accent-text font-semibold">EVERY DAY COUNTS</span>
          </div>
          <h1 className="m-0 mt-1 text-[32px] sm:text-[36px] font-bold tracking-tight text-fg">
            Habit Architecture
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="font-mono text-sm font-semibold text-fg">
              {doneToday} of {state.habits.length} Done Today
            </span>
            <span className="font-mono text-xs text-muted">
              {consistencyPct}% 30-Day Consistency
            </span>
          </div>
          <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "+ Add Habit"}
          </Btn>
        </div>
      </header>

      {/* Contribution Heatmap & Visual Habit Chains Matrix */}
      <HabitContributionGraph state={state} topStreak={topStreak} />

      {/* Main Habit Execution Cards */}
      <Card labelledBy="habits-h" className="max-w-4xl">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <H2 id="habits-h">Active Daily Habits</H2>
            <span className="text-xs text-muted font-mono">({state.habits.length} protocols tracked)</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted">
            <span className="inline-flex items-center gap-1 text-amber-500">🔥 Top streak: {topStreak}d</span>
          </div>
        </div>

        {adding && (
          <HabitForm
            saveLabel="Add habit"
            initial={{ name: "", kind: "tick", goal: 1 }}
            onCancel={() => setAdding(false)}
            onSave={async (v) => {
              if (await act("POST", "/api/habits", v)) setAdding(false);
            }}
          />
        )}

        {state.habits.length === 0 && !adding && (
          <p className="m-0 border-t border-line py-4 text-[14px] text-muted">
            No habits yet. Add one to start a streak.
          </p>
        )}

        <div className="flex flex-col">
          {state.habits.map((h) => (
            <Row key={h.id} habit={h} days={days} act={act} />
          ))}
        </div>
      </Card>
    </>
  );
}

/** 16-Week GitHub-Style Contribution Heatmap Matrix for Daily Habits */
function HabitContributionGraph({ state, topStreak }: { state: State; topStreak: number }) {
  const [tooltip, setTooltip] = useState<{ day: string; done: number; x: number; y: number } | null>(null);

  const habitMap = new Map<string, number>(state.habitDays.map((h) => [h.day, h.done]));
  const habitCount = state.habits.length;

  // Build 16 weeks of calendar matrix (112 days)
  const WEEKS = 16;
  const todayMs = at(state.today);
  const todayDayOfWeek = (new Date(todayMs).getUTCDay() + 6) % 7; // 0=Mon, 6=Sun
  const startMs = todayMs - (todayDayOfWeek + (WEEKS - 1) * 7) * DAY;

  const weeks: { day: string; done: number; level: number }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const week: { day: string; done: number; level: number }[] = [];
    for (let d = 0; d < 7; d++) {
      const currentMs = startMs + (w * 7 + d) * DAY;
      const isoDate = new Date(currentMs).toISOString().slice(0, 10);
      const done = habitMap.get(isoDate) ?? 0;

      // Calculate heat level 0 to 4
      let level = 0;
      if (done > 0 && habitCount > 0) {
        const ratio = done / habitCount;
        level = ratio >= 0.9 ? 4 : ratio >= 0.65 ? 3 : ratio >= 0.4 ? 2 : 1;
      }
      week.push({ day: isoDate, done, level });
    }
    weeks.push(week);
  }

  const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", "Sun"];

  return (
    <Card labelledBy="chains-h" className="max-w-4xl overflow-hidden">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <H2 id="chains-h">Visual Habit Chains & Consistency Matrix</H2>
          <div className="text-xs text-muted font-mono mt-0.5">
            16-Week GitHub-style contribution grid across all daily routines
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-mono text-muted">
          <span>Less</span>
          <span className="size-3 rounded-xs bg-surface3" />
          <span className="size-3 rounded-xs bg-[#25265e]" />
          <span className="size-3 rounded-xs bg-[#3c3b94]" />
          <span className="size-3 rounded-xs bg-[#5654cc]" />
          <span className="size-3 rounded-xs bg-accent shadow-[0_0_6px_var(--accent)]" />
          <span>More</span>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="flex gap-2">
          {/* Day of week labels */}
          <div className="flex flex-col justify-between py-0.5 text-[10px] font-mono text-muted shrink-0 w-6">
            {DAY_LABELS.map((lbl, idx) => (
              <span key={idx} className="h-3 leading-3">
                {lbl}
              </span>
            ))}
          </div>

          {/* Grid of 16 weeks */}
          <div className="flex gap-1.5">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1.5">
                {week.map((item) => {
                  const isFuture = item.day > state.today;
                  const isToday = item.day === state.today;

                  const colorClass = isFuture
                    ? "opacity-15 bg-surface3"
                    : item.level === 4
                    ? "bg-accent shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                    : item.level === 3
                    ? "bg-[#5654cc]"
                    : item.level === 2
                    ? "bg-[#3c3b94]"
                    : item.level === 1
                    ? "bg-[#25265e]"
                    : "bg-surface3/80 hover:bg-surface3";

                  return (
                    <div
                      key={item.day}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ day: item.day, done: item.done, x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      className={`size-3.5 sm:size-4 rounded-xs border transition-all duration-150 ${colorClass} ${
                        isToday ? "border-white ring-1 ring-accent" : "border-white/[0.04]"
                      }`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating tooltip on hover */}
      {tooltip && (
        <div className="mt-2 text-xs font-mono text-white/80 bg-black/60 rounded-lg px-3 py-1.5 border border-white/10 w-fit">
          <span className="font-semibold text-accent-text">{tooltip.day}:</span>{" "}
          <span>{tooltip.done} of {habitCount} habits completed</span>
        </div>
      )}
    </Card>
  );
}

function Row({ habit: h, days, act }: { habit: Habit; days: string[]; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [optimisticToday, setOptimisticToday] = useState(h.today);
  const latestRef = useRef(h.today);
  const acknowledgedRef = useRef(h.today);
  const serverTodayRef = useRef(h.today);
  const pending = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    serverTodayRef.current = h.today;
    if (pending.current === 0) {
      acknowledgedRef.current = h.today;
      latestRef.current = h.today;
      setOptimisticToday(h.today);
    }
  }, [h.today]);

  const done = (h.kind === "count" ? optimisticToday : h.today) >= h.goal;
  const log = (value: number) => act("PUT", `/api/habits/${h.id}/log`, { value });

  const stepCount = (delta: number) => {
    const next = Math.max(0, latestRef.current + delta);
    latestRef.current = next;
    setOptimisticToday(next);
    pending.current++;

    queueRef.current = queueRef.current
      .then(async () => {
        const ok = await log(next);
        pending.current--;
        if (ok) {
          acknowledgedRef.current = next;
          if (pending.current === 0) {
            const target = serverTodayRef.current >= next ? serverTodayRef.current : next;
            latestRef.current = target;
            setOptimisticToday(target);
          }
        } else if (pending.current === 0) {
          latestRef.current = acknowledgedRef.current;
          setOptimisticToday(acknowledgedRef.current);
        }
      })
      .catch(() => {
        pending.current--;
        if (pending.current === 0) {
          latestRef.current = acknowledgedRef.current;
          setOptimisticToday(acknowledgedRef.current);
        }
      });
  };

  if (editing) {
    return (
      <div className="border-t border-line">
        <HabitForm
          saveLabel="Save"
          initial={{ name: h.name, kind: h.kind, goal: h.goal }}
          onCancel={() => setEditing(false)}
          onSave={async (v) => {
            if (await act("PATCH", `/api/habits/${h.id}`, { name: v.name, goal: v.goal })) setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="border-t border-line/70 py-3.5 transition-colors hover:bg-surface2/30 px-2 rounded-xl">
      <div className="flex flex-wrap items-center gap-3">
        {h.kind === "tick" ? (
          <button
            type="button"
            role="switch"
            aria-checked={done}
            aria-label={`${h.name}: ${done ? "done" : "not done"} today`}
            onClick={() => log(done ? 0 : 1)}
            className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent transition-transform active:scale-95"
          >
            <Check on={done} />
          </button>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label={`One fewer for ${h.name}`}
              disabled={optimisticToday === 0}
              onClick={() => stepCount(-1)}
              className="size-10 rounded-xl border border-line bg-surface2 text-lg font-semibold transition-transform active:scale-95 disabled:opacity-30"
            >
              −
            </button>
            <span
              className={`w-14 text-center font-mono text-[15px] ${done ? "font-semibold text-good" : ""}`}
              aria-label={`${optimisticToday} of ${h.goal} today`}
            >
              {optimisticToday}/{h.goal}
            </span>
            <button
              type="button"
              aria-label={`One more for ${h.name}`}
              onClick={() => stepCount(1)}
              className="size-10 rounded-xl border border-line bg-surface2 text-lg font-semibold transition-transform active:scale-95"
            >
              +
            </button>
          </div>
        )}

        <div className="min-w-0 flex-[1_1_160px]">
          <div className={`text-[15px] font-medium ${done ? "text-muted" : "text-fg"}`}>{h.name}</div>
          <div className="mt-0.5 flex items-center gap-2">
            {h.streak > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-amber-500 dark:text-amber-400">
                🔥 {h.streak}d streak
              </span>
            ) : (
              <span className="font-mono text-xs text-muted">Start today</span>
            )}
          </div>
        </div>

        {/* 7-day sparkline */}
        <div
          className="flex gap-1.5"
          role="img"
          aria-label={`Last 7 days: ${h.last7.map((d, i) => `${LETTER(days[i])} ${d ? "done" : "missed"}`).join(", ")}`}
        >
          {h.last7.map((d, i) => (
            <span key={days[i]} className="flex flex-col items-center gap-1">
              <span
                className={`size-4 rounded-full transition-all ${
                  d
                    ? "bg-good shadow-[0_0_8px_rgba(52,211,153,0.4)]"
                    : "bg-surface3"
                } ${i === 6 ? "ring-2 ring-accent ring-offset-1" : ""}`}
              />
              <span className="text-[11px] font-mono text-muted">{LETTER(days[i])}</span>
            </span>
          ))}
        </div>

        <div className="flex">
          <button
            type="button"
            aria-label={`Edit ${h.name}`}
            onClick={() => setEditing(true)}
            className="flex size-10 items-center justify-center border-0 bg-transparent text-[13px] text-muted hover:text-fg"
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete ${h.name}`}
            onClick={() => setRemoving(true)}
            className="flex size-10 items-center justify-center border-0 bg-transparent text-[13px] text-muted hover:text-fg"
          >
            Delete
          </button>
        </div>
      </div>

      {removing && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
          <span className="text-[14px]">Delete {h.name}? Its streak and history go with it.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-fg font-semibold text-bg" onClick={async () => { if (await act("DELETE", `/api/habits/${h.id}`)) setRemoving(false); }}>Delete habit</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

type Values = { name: string; kind: "tick" | "count"; goal: number };

function HabitForm({ initial, saveLabel, onSave, onCancel }: { initial: Values; saveLabel: string; onSave: (v: Values) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const uid = useId();
  const nameId = `${uid}-name`;
  const kindId = `${uid}-kind`;
  const goalId = `${uid}-goal`;
  const editing = saveLabel === "Save";

  return (
    <form
      className="flex flex-wrap items-end gap-3 py-4 border-t border-line"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.name.trim()) void onSave({ ...v, name: v.name.trim() });
      }}
    >
      <div className="flex flex-[1_1_220px] flex-col gap-1.5">
        <label htmlFor={nameId} className="text-[13px] text-muted">Habit name</label>
        <input
          id={nameId}
          autoFocus
          maxLength={60}
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className="h-11 rounded-xl border border-accent bg-bg px-3.5 text-[15px] text-fg"
        />
      </div>

      {!editing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={kindId} className="text-[13px] text-muted">Type</label>
          <select
            id={kindId}
            value={v.kind}
            onChange={(e) =>
              setV({
                ...v,
                kind: e.target.value as Values["kind"],
                goal: e.target.value === "tick" ? 1 : Math.max(2, v.goal),
              })
            }
            className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg"
          >
            <option value="tick">Tick once a day</option>
            <option value="count">Count up to a goal</option>
          </select>
        </div>
      )}

      {v.kind === "count" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={goalId} className="text-[13px] text-muted">Daily goal</label>
          <input
            id={goalId}
            type="number"
            min={1}
            max={50}
            value={v.goal}
            onChange={(e) => setV({ ...v, goal: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
            className="h-11 w-24 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Btn type="submit" kind="primary" className="px-[18px]">{saveLabel}</Btn>
        <Btn kind="outline" className="px-[18px]" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
