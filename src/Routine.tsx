import { useId, useState } from "react";
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2 id="morning-h">Morning kickoff</H2>
        {r.kickoffAt && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-good/40 bg-good/15 px-3 py-1 font-mono text-xs font-semibold text-good shadow-[0_0_8px_rgba(52,211,153,0.25)]">
            <span className="size-1.5 rounded-full bg-good animate-pulse" />
            Started {clock(r.kickoffAt)}
          </span>
        )}
      </div>
      <div className="mt-3.5" role="group" aria-labelledby="sleep-h">
        <div id="sleep-h" className="mb-2 text-[13px] font-medium text-muted">How did you sleep?</div>
        <div className="flex gap-1.5 rounded-xl bg-surface2/60 p-1 border border-line/70 backdrop-blur-sm">
          {SLEEP.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={r.sleep === i + 1}
              aria-label={`Sleep ${i + 1} of 5, ${label}`}
              onClick={() => act("PUT", "/api/routine", { sleep: r.sleep === i + 1 ? null : i + 1 })}
              className={`h-10 flex-1 rounded-[10px] text-[14px] font-medium transition-all duration-150 ${
                r.sleep === i + 1
                  ? "bg-gradient-to-b from-[#6366f1] to-[#4f46e5] text-white shadow-[0_2px_8px_rgba(99,102,241,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] scale-[1.02]"
                  : "text-muted hover:text-fg hover:bg-surface3/40"
              }`}
            >
              <span className="font-mono font-semibold">{i + 1}</span>
              <span className="ml-1.5 hidden text-[12px] sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-[13px] font-medium text-muted">Daily Non-Negotiables (The Big 3)</div>
          <span className="font-mono text-[11px] text-muted">2 Academic + 1 Personal Needle</span>
        </div>
        {big3.length === 0 ? (
          <p className="m-0 text-[14px] text-muted rounded-xl bg-surface2/30 p-3 border border-line/40">No targets yet. Add some in Daily Targets below.</p>
        ) : (
          <ol className="m-0 list-none p-0 flex flex-col gap-1.5">
            {big3.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-surface2/40 px-3 py-2 border border-line/40">
                <span className="flex size-5.5 items-center justify-center rounded-lg bg-surface2 border border-line font-mono text-[12px] font-bold text-accent-text">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className={`text-[14px] font-medium ${t.done ? "text-muted line-through" : "text-fg"}`}>{t.title}</div>
                  <div className="text-[11px] font-mono text-muted">
                    {i < 2 ? "Academic Needle" : "Personal / Health Needle"}
                  </div>
                </div>
                {t.done && <span className="text-xs font-semibold text-good">✓ Done</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="mt-3.5">
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

/** Close the day: wins, prep for tomorrow, and a shutdown stamp. Opens by itself from 5 pm. */
export function Evening({ state, act }: { state: State; act: Act }) {
  const r = state.routine;
  const uid = useId();
  const winsId = `${uid}-wins`;
  const tomorrowId = `${uid}-tomorrow`;
  const [open, setOpen] = useState(() => istHour() >= 17 || !!r.shutdownAt);
  const [wins, setWins] = useState(r.wins);
  const [tomorrow, setTomorrow] = useState(r.tomorrow);
  const [hasUserEdited, setHasUserEdited] = useState(false);
  const doneTargets = state.targets.filter((t) => t.done).length;
  const doneHabits = state.habits.filter((h) => h.today >= h.goal).length;
  const save = (field: "wins" | "tomorrow", value: string) => {
    const trimmed = value.trim();
    if (hasUserEdited && trimmed !== r[field]) {
      void act("PUT", "/api/routine", { [field]: trimmed });
    }
  };
  return (
    <Card labelledBy="evening-h">
      <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
          <H2 id="evening-h">Evening shutdown</H2>
          <span className="font-mono text-[13px] text-muted">
            {r.shutdownAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-good/30 bg-good/10 px-2.5 py-0.5 text-xs font-semibold text-good">
                🌙 Shut down {clock(r.shutdownAt)}
              </span>
            ) : (
              `${doneTargets}/${state.targets.length} targets · ${doneHabits}/${state.habits.length} habits`
            )}
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={winsId} className="text-[13px] font-medium text-muted">Today's wins</label>
            <textarea
              id={winsId}
              rows={2}
              maxLength={1000}
              value={wins}
              placeholder="What went well today? What did you master?"
              onChange={(e) => {
                setWins(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => save("wins", wins)}
              className="w-full resize-none rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-[15px] text-fg focus:border-accent focus:bg-surface2 transition-all placeholder:text-muted/60"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={tomorrowId} className="text-[13px] font-medium text-muted">Prep for tomorrow</label>
            <textarea
              id={tomorrowId}
              rows={2}
              maxLength={1000}
              value={tomorrow}
              placeholder="What's the main focus or first priority tomorrow morning?"
              onChange={(e) => {
                setTomorrow(e.target.value);
                setHasUserEdited(true);
              }}
              onBlur={() => save("tomorrow", tomorrow)}
              className="w-full resize-none rounded-xl border border-line bg-surface2/60 px-3.5 py-2.5 text-[15px] text-fg focus:border-accent focus:bg-surface2 transition-all placeholder:text-muted/60"
            />
          </div>
          <div>
            {r.shutdownAt ? (
              <Btn kind="ghost" className="px-0" onClick={() => act("PUT", "/api/routine", { shutdown: false })}>
                Undo shutdown
              </Btn>
            ) : (
              <Btn kind="primary" onClick={async () => { await act("PUT", "/api/routine", { wins, tomorrow, shutdown: true }); }}>
                Shut down for the day
              </Btn>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
