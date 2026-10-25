import { useEffect, useId, useRef, useState } from "react";
import type { Act, Habit, State } from "./api.ts";
import { AppleEmoji, AppleEmojiPicker, AppleText, Btn, Card, Check, H2, ICONS, Icon, PageHeader } from "./ui.tsx";

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
      <PageHeader title="Habits" sub="Tick them off each day. Streaks count in IST.">

        <div className="flex items-center gap-4">
          <div className="text-right text-sm text-muted">
            <div className="font-semibold text-fg">{doneToday} of {state.habits.length} done today</div>
            <div>{consistencyPct}% over the last 30 days</div>
          </div>
          <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "Add habit"}
          </Btn>
        </div>
      </PageHeader>

      {/* Contribution Heatmap & Visual Habit Chains Matrix */}
      <HabitContributionGraph state={state} topStreak={topStreak} />

      {/* Main Habit Execution Cards */}
      <Card labelledBy="habits-h" className="max-w-4xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <H2 id="habits-h">Every day</H2>
            
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-warn">
            <AppleEmoji emoji="🔥" size={14} />
            <span>Best streak: {topStreak} days</span>
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
          <p className="m-0 border-t border-line py-5 text-sm text-muted">
            No habits yet. Add one above to start a streak.
          </p>
        )}

        <div className="flex flex-col gap-2">
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
          <H2 id="chains-h">Last 16 weeks</H2>
          <div className="text-xs text-muted mt-1">
            16-Week activity visualization across all daily habits
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <span>Less</span>
          <span className="size-3 rounded-[3px] bg-surface2 border border-line" />
          <span className="size-3 rounded-[3px] bg-heat-1" />
          <span className="size-3 rounded-[3px] bg-heat-2" />
          <span className="size-3 rounded-[3px] bg-heat-3" />
          <span className="size-3 rounded-[3px] bg-heat-4" />
          <span>More</span>
        </div>
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="flex gap-2.5">
          {/* Day of week labels */}
          <div className="flex flex-col justify-between py-0.5 text-[11px] text-muted shrink-0 w-6">
            {DAY_LABELS.map((lbl, idx) => (
              <span key={idx} className="h-3.5 leading-3.5">
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
                    ? "opacity-20 bg-white/5"
                    : item.level === 4
                    ? "bg-heat-4"
                    : item.level === 3
                    ? "bg-heat-3"
                    : item.level === 2
                    ? "bg-heat-2"
                    : item.level === 1
                    ? "bg-heat-1"
                    : "bg-surface2 hover:bg-surface3";

                  return (
                    <div
                      key={item.day}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setTooltip({ day: item.day, done: item.done, x: rect.left, y: rect.top });
                      }}
                      onMouseLeave={() => setTooltip(null)}
                      className={`size-3.5 sm:size-4 rounded-[3px] transition-all cursor-pointer ${colorClass} ${
                        isToday ? "ring-2 ring-white ring-offset-1 ring-offset-[#0f131c]" : ""
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
        <div className="mt-2 text-xs text-fg/80 bg-surface rounded-lg px-3 py-1.5 border border-line w-fit shadow-lg">
          <span className="font-semibold text-fg">{tooltip.day}:</span>{" "}
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
      <div className="border-t border-line py-2">
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 p-3 sm:px-4 transition-all hover:border-line-strong hover:bg-surface2">
      <div className="flex min-w-0 flex-[1_1_200px] items-center gap-3">
        {h.kind === "tick" ? (
          <button
            type="button"
            role="switch"
            aria-checked={done}
            aria-label={`${h.name}: ${done ? "done" : "not done"} today`}
            onClick={() => log(done ? 0 : 1)}
            className="flex size-8 shrink-0 items-center justify-center border-0 bg-transparent transition-transform active:scale-95"
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
              className="size-8 rounded-lg border border-line bg-surface2 text-sm font-semibold text-fg hover:bg-white hover:text-zinc-950 transition-all disabled:opacity-20 font-mono flex items-center justify-center active:scale-95"
            >
              −
            </button>
            <span
              className={`w-12 text-center font-mono text-xs tabular-nums ${done ? "font-semibold text-accent" : "text-fg/80"}`}
              aria-label={`${optimisticToday} of ${h.goal} today`}
            >
              {optimisticToday}/{h.goal}
            </span>
            <button
              type="button"
              aria-label={`One more for ${h.name}`}
              onClick={() => stepCount(1)}
              className="size-8 rounded-lg border border-line bg-surface2 text-sm font-semibold text-fg hover:bg-white hover:text-zinc-950 transition-all font-mono flex items-center justify-center active:scale-95"
            >
              +
            </button>
          </div>
        )}

        <div className="min-w-0 flex-[1_1_160px]">
          <div className={`text-sm font-medium ${done ? "text-muted line-through" : "text-fg"}`}>
            <AppleText text={h.name} size={15} />
          </div>
          <div className="mt-1 flex items-center gap-2">
            {h.streak > 0 ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-warn/30 bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn tracking-wide">
                <AppleEmoji emoji="🔥" size={12} />
                <span>{h.streak}d streak</span>
              </span>
            ) : (
              <span className="text-[11px] text-muted">Start streak today</span>
            )}
          </div>
        </div>
      </div>

      {/* 7-day sparkline */}
      <div
        className="flex gap-1.5 items-center"
        role="img"
        aria-label={`Last 7 days: ${h.last7.map((d, i) => `${LETTER(days[i])} ${d ? "done" : "missed"}`).join(", ")}`}
      >
        {h.last7.map((d, i) => (
          <span key={days[i]} className="flex flex-col items-center gap-1">
            <span
              className={`size-3.5 rounded-[3px] border transition-all ${
                d
                  ? "bg-heat-4 border-heat-4"
                  : "bg-surface2 border-line"
              } ${i === 6 ? "ring-1 ring-white/60" : ""}`}
            />
            <span className="text-[11px] text-muted">{LETTER(days[i])}</span>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Edit ${h.name}`}
          onClick={() => setEditing(true)}
          className="flex h-8 px-2.5 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-muted hover:text-fg transition-all"
        >
          Edit
        </button>
        <button
          type="button"
          aria-label={`Delete ${h.name}`}
          onClick={() => setRemoving(true)}
          className="flex h-8 px-2.5 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-muted hover:text-danger transition-all"
        >
          Delete
        </button>
      </div>

      {removing && (
        <div role="alert" className="mt-2 w-full flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <span className="text-xs text-danger">Delete "{h.name}"? Streak and history will be permanently removed.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-danger font-semibold text-on-solid hover:opacity-90" onClick={async () => { if (await act("DELETE", `/api/habits/${h.id}`)) setRemoving(false); }}>Delete habit</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

type Values = { name: string; kind: "tick" | "count"; goal: number };

function HabitForm({ initial, saveLabel, onSave, onCancel }: { initial: Values; saveLabel: string; onSave: (v: Values) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const [showPicker, setShowPicker] = useState(false);
  const uid = useId();
  const nameId = `${uid}-name`;
  const kindId = `${uid}-kind`;
  const goalId = `${uid}-goal`;
  const editing = saveLabel === "Save";

  const handleSelectEmoji = (emoji: string) => {
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*/u;
    if (emojiRegex.test(v.name)) {
      setV({ ...v, name: v.name.replace(emojiRegex, `${emoji} `) });
    } else {
      setV({ ...v, name: `${emoji} ${v.name}`.trim() });
    }
  };

  const QUICK_HABIT_EMOJIS = ["💧", "📚", "🧘", "🏃", "🍎", "🛌", "🧠", "⚡", "🎯"];

  return (
    <div className="flex flex-col gap-3 py-4 border-t border-line">
      <form
        className="flex flex-wrap items-end gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (v.name.trim()) void onSave({ ...v, name: v.name.trim() });
        }}
      >
        <div className="flex flex-[1_1_220px] flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={nameId} className="text-xs font-medium text-fg/80">Habit Name</label>
            <button
              type="button"
              onClick={() => setShowPicker((p) => !p)}
              className="text-xs text-accent hover:text-accent-hover flex items-center gap-1 cursor-pointer"
            >
              <AppleEmoji emoji="✨" size={12} />
              <span>{showPicker ? "Close Picker" : "Apple Emoji"}</span>
            </button>
          </div>
          <div className="relative flex items-center">
            <input
              id={nameId}
              autoFocus
              maxLength={60}
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="e.g. 20m Daily Math Practice"
              className="h-10 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg focus:border-accent transition-all placeholder:text-muted"
            />
          </div>
        </div>

        {!editing && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={kindId} className="text-xs font-medium text-fg/80">Tracking Type</label>
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
              className="h-10 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg focus:border-accent cursor-pointer"
            >
              <option value="tick">Binary (Done / Not Done)</option>
              <option value="count">Count (Target value per day)</option>
            </select>
          </div>
        )}

        {v.kind === "count" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={goalId} className="text-xs font-medium text-fg/80">Daily Goal</label>
            <input
              id={goalId}
              type="number"
              min={1}
              max={50}
              value={v.goal}
              onChange={(e) => setV({ ...v, goal: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
              className="h-10 w-24 rounded-xl border border-line-strong bg-surface px-3.5 text-sm font-mono text-fg focus:border-accent"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Btn type="submit" kind="primary" className="px-5">{saveLabel}</Btn>
          <Btn kind="outline" className="px-4" onClick={onCancel}>Cancel</Btn>
        </div>
      </form>

      {/* Quick Apple Emoji Bar */}
      <div className="flex items-center gap-1.5 pt-1 overflow-x-auto no-scrollbar">
        <span className="text-xs text-muted shrink-0 font-medium">Quick Emoji:</span>
        {QUICK_HABIT_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => handleSelectEmoji(e)}
            className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface2 hover:bg-surface3 hover:scale-110 active:scale-95 transition-all cursor-pointer"
          >
            <AppleEmoji emoji={e} size={16} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPicker((p) => !p)}
          className="text-xs text-accent hover:text-accent-hover ml-1.5 underline cursor-pointer"
        >
          {showPicker ? "Hide" : "+ More Emojis"}
        </button>
      </div>

      {/* Popover / Embedded Apple Emoji Picker */}
      {showPicker && (
        <div className="mt-1">
          <AppleEmojiPicker
            onSelect={(e) => handleSelectEmoji(e)}
            onClose={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
