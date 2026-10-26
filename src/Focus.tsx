import { useEffect, useMemo, useRef, useState } from "react";
import { BREAK_S, FOCUS_S, LONG_BREAK_S, ROUNDS } from "../server/timer.ts";
import { call, type Act, type State } from "./api.ts";
import { chime, unlockAudio } from "./chime.ts";
import { AppleEmoji, plural } from "./ui.tsx";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * The timer lives in the cloud, so it can be started on one device and stopped on another. This hook is the
 * only place that ticks, chimes and sets the tab title; the card and the phone bar just draw what it returns.
 */
export function useFocus(state: State, reload: () => Promise<void>, act: Act) {
  const timer = state.timer;
  const [subject, setSubject] = useState(() => { try { return localStorage.getItem("focus-subject") ?? "maths"; } catch { return "maths"; } });
  const [note, setNote] = useState("");
  const [masteryPrompt, setMasteryPrompt] = useState(false);
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
      if (timer.mode === "focus") {
        setMasteryPrompt(true);
      }
      void reload();
      setTimeout(() => void reload(), 1500); // the first ask can land just before the server's clock reaches the end
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

  const start = async (customDurationS?: number) => {
    unlockAudio();
    try { localStorage.setItem("focus-subject", subject); } catch { /* optional */ }
    setNote("");
    setMasteryPrompt(false);
    await act("POST", "/api/timer/start", { subjectId: subject, durationS: customDurationS });
  };

  const stop = async () => {
    const wasFocus = timer.mode === "focus";
    try {
      const r = await call<{ logged: number }>("POST", "/api/timer/stop");
      if (wasFocus && r.logged > 0) {
        setMasteryPrompt(true);
      }
      setNote(wasFocus ? (r.logged ? `Logged ${plural(r.logged, "minute")}.` : "Stopped. Under a minute, so nothing was logged.") : "");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't stop the timer.");
    }
    await reload();
  };

  const shownSubject = (running ? timer.subjectId : null) ?? subject;
  const subjectName = state.subjects.find((s) => s.id === shownSubject)?.name ?? "";

  const submitMasteryNote = async (text: string) => {
    const clean = text.trim();
    if (!clean) {
      setMasteryPrompt(false);
      return;
    }
    try {
      await act("POST", "/api/sessions/note", { note: clean });
      await act("POST", "/api/captures", { text: `[Mastered] ${subjectName || "Study"}: ${clean}`, kind: "note" });
    } finally {
      setMasteryPrompt(false);
      await reload();
    }
  };

  const dismissMasteryPrompt = () => setMasteryPrompt(false);

  const total = timer.mode === "focus" ? (timer.durationS || FOCUS_S) : timer.mode === "long_break" ? LONG_BREAK_S : timer.mode === "break" ? BREAK_S : FOCUS_S;
  const round = timer.mode === "long_break" ? ROUNDS : timer.mode === "break" ? timer.round : timer.round + 1;
  const roundText =
    timer.mode === "long_break" ? "Cycle complete" : timer.mode === "break" ? `Round ${timer.round} of ${ROUNDS} done` : `Round ${round} of ${ROUNDS}`;
  const next =
    timer.mode === "focus" ? `then a ${(timer.round + 1 >= ROUNDS ? LONG_BREAK_S : (total >= 50 * 60 ? 10 * 60 : BREAK_S)) / 60} min break`
    : running ? "then back to focus"
    : "Focus cycle ready";

  return { timer, running, remaining, total, label, subject, setSubject, subjectName, roundText, next, note, start, stop, masteryPrompt, setMasteryPrompt, submitMasteryNote, dismissMasteryPrompt };
}
export type FocusModel = ReturnType<typeof useFocus>;

/** Sticky, thumb-accessible Focus & Quick-Action Bar on mobile viewports (<768px). */
export function FocusBar({
  focus,
  state,
  onToday,
  onOpenZen,
  onOpenCapture,
}: {
  focus: FocusModel;
  state: State;
  onToday: boolean;
  onOpenZen?: () => void;
  onOpenCapture?: () => void;
}) {
  const f = focus;
  // Only while a round is running: starting one is the job of the "Next up" card.
  if (!f.running) return null;
  return (
    <div className="fixed inset-x-0 bottom-[76px] z-10 px-3 lg:hidden">
      <div className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface py-2 pl-4 pr-2 shadow-lg">
        <>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpenZen}>
              <div role="timer" aria-live="off" className="tabular-nums text-lg font-semibold text-fg tracking-tight leading-snug">
                {mmss(f.remaining)}
              </div>
              <div className="text-xs font-sans text-fg/80 truncate">
                {f.timer.mode === "focus" ? `${f.subjectName} · ${f.roundText}` : f.label}
              </div>
            </div>
            {onOpenZen && (
              <button
                type="button"
                onClick={onOpenZen}
                aria-label="Zen mode"
                className="flex size-11 items-center justify-center rounded-lg border border-line bg-surface2 text-fg/80 hover:text-fg transition-all active:scale-95"
              >
                <AppleEmoji emoji="🧘" size={16} />
              </button>
            )}
            <button
              type="button"
              className="min-h-[44px] px-3.5 rounded-lg border border-transparent bg-fg text-bg font-sans text-xs font-semibold tracking-wide active:scale-95 transition-all shadow-xs"
              onClick={f.stop}
            >
              {f.timer.mode === "focus" ? "Stop" : "Skip"}
            </button>
        </>

        {/* 1-Tap Thumb-Accessible Floating Quick Capture Action (44px target) */}
        {onOpenCapture && (
          <button
            type="button"
            aria-label="Quick capture"
            onClick={onOpenCapture}
            title="Quick Capture [Ctrl+K]"
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-focus/40 bg-fg text-bg font-mono font-bold text-lg active:scale-95 hover:opacity-90 transition-all shadow-sm"
          >
            +
          </button>
        )}
      </div>
      {f.note && <p role="status" className="m-0 mt-1 text-center font-sans text-xs text-fg/80">{f.note}</p>}
    </div>
  );
}
