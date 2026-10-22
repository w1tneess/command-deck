import { useEffect, useMemo, useRef, useState } from "react";
import { BREAK_S, FOCUS_S, LONG_BREAK_S, ROUNDS } from "../server/timer.ts";
import { call, type Act, type State } from "./api.ts";
import { chime, unlockAudio } from "./chime.ts";
import { Btn, Card, H2, plural } from "./ui.tsx";

const RING = 2 * Math.PI * 88; // circumference of the r=88 ring in the design
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * The timer lives in the cloud, so it can be started on one device and stopped on another. This hook is the
 * only place that ticks, chimes and sets the tab title; the card and the phone bar just draw what it returns.
 */
export function useFocus(state: State, reload: () => Promise<void>, act: Act) {
  const timer = state.timer;
  const [subject, setSubject] = useState(() => { try { return localStorage.getItem("focus-subject") ?? "maths"; } catch { return "maths"; } });
  const [note, setNote] = useState("");
  const [, tick] = useState(0);
  const fired = useRef<number | null>(null);
  // Count against the server's clock, so a device with the wrong time still shows the right countdown.
  const skew = useMemo(() => timer.serverNow - Date.now(), [timer.serverNow, timer.endsAt]);
  const running = timer.mode !== "idle" && timer.endsAt !== null;
  const remaining = running ? Math.max(0, Math.ceil((timer.endsAt! - (Date.now() + skew)) / 1000)) : 0;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running, timer.endsAt]);

  // When a round ends: chime once, then refresh so the server logs the session and starts the break.
  useEffect(() => {
    if (running && remaining === 0 && fired.current !== timer.endsAt) {
      fired.current = timer.endsAt;
      chime();
      void reload();
    }
  });

  const label = { idle: "Ready", focus: "Focus", break: "Break", long_break: "Long break" }[timer.mode];
  useEffect(() => {
    document.title = running ? `${mmss(remaining)} ${label} · Study` : "Study";
  }, [running, remaining, label]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const start = async () => {
    unlockAudio();
    try { localStorage.setItem("focus-subject", subject); } catch { /* optional */ }
    setNote("");
    await act("POST", "/api/timer/start", { subjectId: subject });
  };
  const stop = async () => {
    try {
      const r = await call<{ logged: number }>("POST", "/api/timer/stop");
      setNote(timer.mode === "focus" ? (r.logged ? `Logged ${plural(r.logged, "minute")}.` : "Stopped. Under a minute, so nothing was logged.") : "");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't stop the timer.");
    }
    await reload();
  };

  const shownSubject = (running ? timer.subjectId : null) ?? subject;
  const subjectName = state.subjects.find((s) => s.id === shownSubject)?.name ?? "";
  const total = timer.mode === "focus" ? FOCUS_S : timer.mode === "long_break" ? LONG_BREAK_S : timer.mode === "break" ? BREAK_S : FOCUS_S;
  const round = timer.mode === "long_break" ? ROUNDS : timer.mode === "break" ? timer.round : timer.round + 1;
  const roundText =
    timer.mode === "long_break" ? "Cycle complete" : timer.mode === "break" ? `Round ${timer.round} of ${ROUNDS} done` : `Round ${round} of ${ROUNDS}`;
  const next =
    timer.mode === "focus" ? `then a ${(timer.round + 1 >= ROUNDS ? LONG_BREAK_S : BREAK_S) / 60} min break`
    : running ? "then back to focus"
    : "25 min focus";
  return { timer, running, remaining, total, label, subject, setSubject, subjectName, roundText, next, note, start, stop };
}
export type FocusModel = ReturnType<typeof useFocus>;

/** Desktop card: the ring from the design, with Stop while running and Subject + Start when idle. */
export function FocusCard({ focus, state }: { focus: FocusModel; state: State }) {
  const f = focus;
  const shown = f.running ? f.remaining : FOCUS_S;
  const arc = f.running ? (f.remaining / f.total) * RING : 0;
  return (
    <Card labelledBy="focus-h" className="flex flex-col items-center gap-4">
      <div className="flex items-baseline justify-between self-stretch">
        <H2 id="focus-h">Focus</H2>
        <span className="text-[13px] text-muted">{f.roundText}{f.running && f.timer.mode === "focus" ? ` · ${f.subjectName}` : ""}</span>
      </div>
      <div className="relative size-[200px]">
        <svg width="200" height="200" viewBox="0 0 200 200" role="img" aria-label={f.running ? `${mmss(f.remaining)} left in this ${f.label.toLowerCase()}` : "Ready for a 25 minute focus round"} className="-rotate-90">
          <circle cx="100" cy="100" r="88" fill="none" stroke="var(--line)" strokeWidth="10" />
          {f.running && (
            <circle cx="100" cy="100" r="88" fill="none" stroke={f.timer.mode === "focus" ? "var(--accent)" : "var(--good)"} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${arc} ${RING}`} />
          )}
        </svg>
        <div role="timer" aria-live="off" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-[46px] font-medium tracking-[-0.02em]">{mmss(shown)}</span>
          <span className="text-[13px] text-muted">{f.next}</span>
        </div>
      </div>
      <div className="flex gap-3 self-stretch">
        {f.running ? (
          <Btn className="h-12 flex-1 text-[15px] font-medium" onClick={f.stop}>{f.timer.mode === "focus" ? "Stop" : "Skip break"}</Btn>
        ) : (
          <>
            <select
              aria-label="Subject"
              value={f.subject}
              onChange={(e) => f.setSubject(e.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl border border-line bg-transparent px-3 text-[15px] text-fg"
            >
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Btn kind="primary" className="h-12 flex-1 text-[15px]" onClick={f.start}>Start</Btn>
          </>
        )}
      </div>
      {f.note && <p role="status" className="m-0 text-center text-[13px] text-fg">{f.note}</p>}
      <p className="m-0 text-center text-[13px] text-muted">A finished round logs to its subject on its own, even with every tab closed.</p>
    </Card>
  );
}

/** Phone bar, pinned above the dock. Shows while a round runs, and on Today so a round can be started. */
export function FocusBar({ focus, state, onToday }: { focus: FocusModel; state: State; onToday: boolean }) {
  const f = focus;
  if (!f.running && !onToday) return null;
  return (
    <div className="fixed inset-x-0 bottom-[76px] z-10 px-4 lg:hidden">
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface2 py-2.5 pr-2.5 pl-4 shadow-lg">
        {f.running ? (
          <>
            <div className="flex-1">
              <div role="timer" aria-live="off" className="font-mono text-2xl font-medium tracking-[-0.02em]">{mmss(f.remaining)}</div>
              <div className="text-xs text-muted">{f.timer.mode === "focus" ? `${f.subjectName} · ${f.roundText.toLowerCase()}` : f.label}</div>
            </div>
            <Btn kind="primary" className="h-11 px-5 text-[15px]" onClick={f.stop}>{f.timer.mode === "focus" ? "Stop" : "Skip"}</Btn>
          </>
        ) : (
          <>
            <div className="flex-1">
              <div className="text-xs text-muted">Focus · {f.roundText.toLowerCase()}</div>
              <select aria-label="Subject" value={f.subject} onChange={(e) => f.setSubject(e.target.value)} className="-ml-1 h-11 max-w-full bg-transparent text-[15px] font-medium text-fg">
                {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <Btn kind="primary" className="h-11 px-5 text-[15px]" onClick={f.start}>Start</Btn>
          </>
        )}
      </div>
      {f.note && <p role="status" className="m-0 mt-1 text-center text-xs text-muted">{f.note}</p>}
    </div>
  );
}
