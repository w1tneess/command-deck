import { useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
import { Btn, H2, PageHeader, Segmented } from "./ui.tsx";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const istHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())) % 24;
const SLEEP = ["Poor", "Short", "OK", "Good", "Great"] as const;

/** Start the day: how you slept, the three things that matter, and a stamp when you begin. */
export function Morning({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const big3 = state.targets.slice(0, 3);
  return (
    <section aria-labelledby="morning-h" className="min-w-0 rounded-2xl bg-surface2 p-4 ring-1 ring-line text-fg">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="morning-h">Morning</H2>
        {r.kickoffAt && <span className="text-sm text-muted">Started at {clock(r.kickoffAt)}</span>}
      </div>

      <div className="mt-5">
        <div id="sleep-h" className="mb-2 text-sm font-medium text-muted">How did you sleep?</div>
        <Segmented
          label="Sleep quality"
          value={r.sleep ? String(r.sleep) : ""}
          onChange={(v) => act("PUT", "/api/routine", { sleep: r.sleep === Number(v) ? null : Number(v) })}
          options={SLEEP.map((label, i) => [String(i + 1), `${i + 1} ${label}`] as const)}
        />
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-medium text-muted">Your three for today</div>
        {big3.length === 0 ? (
          <p className="m-0 text-sm text-muted">Nothing planned yet. Add targets on Today.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 md:gap-3">
            {big3.map((t) => (
              <li key={t.id} className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2">
                <span className={`text-base ${t.done ? "text-muted line-through" : "text-fg"}`}>{t.title}</span>
                {t.done && <span className="shrink-0 text-sm font-medium text-accent">Done</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        {r.kickoffAt ? (
          <Btn kind="ghost" className="px-0" onClick={() => act("PUT", "/api/routine", { kickoff: false })}>
            Undo start
          </Btn>
        ) : (
          <Btn kind="primary" onClick={() => act("PUT", "/api/routine", { kickoff: true })}>
            Start the day
          </Btn>
        )}
      </div>
    </section>
  );
}

/** Close the day: wins, prep for tomorrow, and a shutdown stamp. Keyed by routine day so midnight resets the form. */
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

  const field = "w-full resize-none rounded-2xl border border-line-strong bg-surface px-4 py-3 text-base text-fg placeholder:text-muted focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <section aria-labelledby="evening-h" className="min-w-0 rounded-2xl bg-surface2 p-4 ring-1 ring-line text-fg">
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-baseline justify-between gap-2">
          <H2 id="evening-h">Evening</H2>
          <span className="text-sm text-muted">
            {r.shutdownAt ? `Closed at ${clock(r.shutdownAt)}` : `${doneTargets} of ${state.targets.length} targets, ${doneHabits} of ${state.habits.length} habits`}
          </span>
        </summary>
        <div className="mt-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor={winsId} className="text-sm font-medium text-muted">What went well today?</label>
            <textarea
              id={winsId}
              rows={3}
              maxLength={1000}
              value={wins}
              placeholder="A concept that clicked, a chapter finished."
              onChange={(e) => {
                setWins(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => void save("wins", wins)}
              className={field}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={tomorrowId} className="text-sm font-medium text-muted">What is first tomorrow?</label>
            <textarea
              id={tomorrowId}
              rows={3}
              maxLength={1000}
              value={tomorrow}
              placeholder="The first thing to pick up in the morning."
              onChange={(e) => {
                setTomorrow(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => void save("tomorrow", tomorrow)}
              className={field}
            />
          </div>
          <div>
            {r.shutdownAt ? (
              <Btn kind="ghost" className="px-0" onClick={handleShutdown}>
                Reopen the day
              </Btn>
            ) : (
              <Btn kind="primary" onClick={handleShutdown}>
                Close the day
              </Btn>
            )}
          </div>
        </div>
      </details>
    </section>
  );
}

export function Routine({ state, act }: { state: State; act: Act }) {
  return (
    <div className="flex w-full flex-col gap-4 md:gap-6">
      <PageHeader title="Routine" sub="Start the day, then close it." />
      <Morning state={state} act={act} />
      <Evening key={state.routine.day} state={state} act={act} />
    </div>
  );
}
