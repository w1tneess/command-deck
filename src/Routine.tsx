import { useState } from "react";
import type { Act, State } from "./api.ts";
import { Btn, Card, H2 } from "./ui.tsx";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const istHour = () => Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(new Date())) % 24;
const SLEEP = ["Poor", "Short", "OK", "Good", "Great"];

/** Plan the day: rate last night's sleep, see the Big 3, and mark the day as started. */
export function Morning({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const big3 = state.targets.slice(0, 3);
  return (
    <Card labelledBy="morning-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="morning-h">Morning kickoff</H2>
        {r.kickoffAt && <span className="font-mono text-[13px] text-good">Started {clock(r.kickoffAt)}</span>}
      </div>
      <div className="mt-3" role="group" aria-labelledby="sleep-h">
        <div id="sleep-h" className="mb-1.5 text-[13px] text-muted">How did you sleep?</div>
        <div className="flex gap-1.5">
          {SLEEP.map((label, i) => (
            <button key={label} type="button" aria-pressed={r.sleep === i + 1} aria-label={`Sleep ${i + 1} of 5, ${label}`} onClick={() => act("PUT", "/api/routine", { sleep: r.sleep === i + 1 ? null : i + 1 })}
              className={`h-11 flex-1 rounded-xl border text-[14px] font-medium ${r.sleep === i + 1 ? "border-accent bg-accent text-ink" : "border-line bg-surface text-fg lg:bg-surface2"}`}>
              <span className="font-mono">{i + 1}</span><span className="ml-1.5 hidden text-[12px] sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-1 text-[13px] text-muted">Your Big 3 today</div>
        {big3.length === 0 ? <p className="m-0 text-[14px] text-muted">No targets yet. Add some below.</p> : (
          <ol className="m-0 list-none p-0">
            {big3.map((t, i) => (
              <li key={t.id} className="flex items-baseline gap-3 border-t border-line py-2 first:border-t-0">
                <span className="font-mono text-[13px] text-muted">{i + 1}</span>
                <span className={`text-[15px] ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-3">
        {r.kickoffAt ? <Btn kind="ghost" className="px-0" onClick={() => act("PUT", "/api/routine", { kickoff: false })}>Undo kickoff</Btn> : <Btn kind="primary" onClick={() => act("PUT", "/api/routine", { kickoff: true })}>Start the day</Btn>}
      </div>
    </Card>
  );
}

/** Close the day: wins, prep for tomorrow, and a shutdown stamp. Opens by itself from 5 pm. */
export function Evening({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const [open, setOpen] = useState(() => istHour() >= 17 || !!r.shutdownAt);
  const [wins, setWins] = useState(r.wins);
  const [tomorrow, setTomorrow] = useState(r.tomorrow);
  const doneTargets = state.targets.filter((t) => t.done).length;
  const doneHabits = state.habits.filter((h) => h.today >= h.goal).length;
  const save = (field: "wins" | "tomorrow", value: string) => { if (value.trim() !== r[field]) void act("PUT", "/api/routine", { [field]: value }); };
  return (
    <Card labelledBy="evening-h">
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
          <H2 id="evening-h">Evening shutdown</H2>
          <span className="font-mono text-[13px] text-muted">{r.shutdownAt ? <span className="text-good">Shut down {clock(r.shutdownAt)}</span> : `${doneTargets}/${state.targets.length} targets · ${doneHabits}/${state.habits.length} habits`}</span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wins" className="text-[13px] text-muted">Today's wins</label>
            <textarea id="wins" rows={2} maxLength={1000} value={wins} onChange={(e) => setWins(e.target.value)} onBlur={() => save("wins", wins)} className="w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-fg" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="tomorrow" className="text-[13px] text-muted">Prep for tomorrow</label>
            <textarea id="tomorrow" rows={2} maxLength={1000} value={tomorrow} onChange={(e) => setTomorrow(e.target.value)} onBlur={() => save("tomorrow", tomorrow)} className="w-full resize-none rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-fg" />
          </div>
          <div>
            {r.shutdownAt ? (
              <Btn kind="ghost" className="px-0" onClick={() => act("PUT", "/api/routine", { shutdown: false })}>Undo shutdown</Btn>
            ) : (
              <Btn kind="primary" onClick={async () => { await act("PUT", "/api/routine", { wins, tomorrow, shutdown: true }); }}>Shut down for the day</Btn>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
