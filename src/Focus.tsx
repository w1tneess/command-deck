import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BREAK_S, FOCUS_S, LONG_BREAK_S, ROUNDS } from "../server/timer.ts";
import { getCurrentAmbient, getAmbientVolume, playAmbientSound, setAmbientVolume, stopAmbientSound } from "./ambientAudio.ts";
import { call, type Act, type State } from "./api.ts";
import { chime, unlockAudio } from "./chime.ts";
import { AppleEmoji, AppleText, Card, H2, ICONS, Icon, plural } from "./ui.tsx";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const INTERVAL_PRESETS = [
  { id: "25_5", label: "25/5 STD", durationS: 25 * 60, breakMin: 5 },
  { id: "50_10", label: "50/10 DEEP", durationS: 50 * 60, breakMin: 10 },
  { id: "custom", label: "CUSTOM", durationS: 45 * 60, breakMin: 10 },
] as const;

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

const RADIUS = 64;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Desktop card: Clean modern workspace Focus Studio with interval presets, ambient audio, and integrated scratchpad. */
export function FocusCard({
  focus,
  state,
  act,
  onOpenZen,
}: {
  focus: FocusModel;
  state: State;
  act?: Act;
  onOpenZen?: () => void;
}) {
  const f = focus;
  const [selectedInterval, setSelectedInterval] = useState<"25_5" | "50_10" | "custom">("25_5");
  const [customMin, setCustomMin] = useState(45);
  const [ambient, setAmbient] = useState<"none" | "binaural" | "rain" | "whitenoise" | "cafe">(getCurrentAmbient);
  const [volume, setVol] = useState<number>(getAmbientVolume);

  // Integrated Scratchpad state (persisted to localStorage)
  const [scratchpad, setScratchpad] = useState(() => {
    try {
      return localStorage.getItem("focus_scratchpad") ?? "";
    } catch {
      return "";
    }
  });
  const [scratchOpen, setScratchOpen] = useState(true);
  const [savingScratch, setSavingScratch] = useState(false);
  const scratchBusy = useRef(false);
  const masteryInputId = useId();

  const shown = f.running ? f.remaining : selectedInterval === "50_10" ? 50 * 60 : selectedInterval === "custom" ? customMin * 60 : FOCUS_S;
  const isFocusMode = f.timer.mode === "focus";
  const isBreakMode = f.timer.mode === "break" || f.timer.mode === "long_break";
  const progressRatio = f.running ? f.remaining / f.total : 1;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progressRatio);

  const handleStart = () => {
    const durationS = selectedInterval === "50_10" ? 50 * 60 : selectedInterval === "custom" ? customMin * 60 : FOCUS_S;
    void f.start(durationS);
  };

  const handleAmbient = (type: "none" | "binaural" | "rain" | "whitenoise" | "cafe") => {
    if (type === "none" || ambient === type) {
      stopAmbientSound();
      setAmbient("none");
    } else {
      playAmbientSound(type);
      setAmbient(type);
    }
  };

  const handleVolumeChange = (v: number) => {
    setVol(v);
    setAmbientVolume(v);
  };

  const handleSaveScratchToCapture = async () => {
    if (!act || !scratchpad.trim() || scratchBusy.current) return;
    scratchBusy.current = true;
    setSavingScratch(true);
    try {
      const ok = await act("POST", "/api/captures", { text: scratchpad.trim(), kind: "note" });
      if (ok) {
        setScratchpad("");
        try { localStorage.removeItem("focus_scratchpad"); } catch {}
      }
    } finally {
      scratchBusy.current = false;
      setSavingScratch(false);
    }
  };

  return (
    <Card labelledBy="focus-h" className="flex flex-col gap-4">
      {/* Calm Faceplate Header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${f.running ? (isFocusMode ? "bg-fg" : "bg-emerald-400") : "bg-zinc-600"}`} />
          <span id="focus-h" className="font-sans text-xs font-semibold tracking-tight text-white">Focus Studio</span>
        </div>
        <span className="font-sans text-xs text-zinc-400">
          {f.roundText}{f.running && isFocusMode ? ` · ${f.subjectName}` : ""}
        </span>
      </div>

      {/* Session Mastery Prompt */}
      {f.masteryPrompt && (
        <div className="flex flex-col gap-2 rounded-xl border border-sky-500/30 bg-sky-950/30 p-3.5 text-xs animate-fade-in shadow-lg">
          <div className="flex items-center justify-between">
            <span className="font-sans font-semibold text-sky-400 text-xs flex items-center gap-1.5">
              <AppleEmoji emoji="✨" size={14} />
              <span>What did you master this session?</span>
            </span>
            <button
              type="button"
              aria-label="Dismiss mastery prompt"
              onClick={f.dismissMasteryPrompt}
              className="text-zinc-400 hover:text-white font-mono text-xs px-1"
            >
              ✕
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem("mastery") as HTMLInputElement;
              await f.submitMasteryNote(input?.value || "");
            }}
            className="flex gap-2"
          >
            <label htmlFor={masteryInputId} className="sr-only">What did you master this session?</label>
            <input
              id={masteryInputId}
              name="mastery"
              autoFocus
              placeholder="e.g. Solved Trigonometric identities, Chemical equations balancing..."
              className="flex-1 h-8 rounded-lg border border-white/15 bg-surface px-3 font-sans text-xs text-white placeholder:text-zinc-500 focus:border-sky-400 transition-all"
            />
            <button
              type="submit"
              className="h-8 rounded-lg bg-fg hover:opacity-90 text-zinc-950 px-3 font-sans text-xs font-semibold transition-all shadow-xs"
            >
              Log Note
            </button>
          </form>
        </div>
      )}

      {/* Break Mode Auto-Transition Banner & Stretch/Water Reminder */}
      {isBreakMode && (
        <div className="flex flex-col gap-2 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-4 text-xs animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-sans font-semibold text-emerald-400 text-sm">
              <AppleEmoji emoji="☕" size={16} />
              <span>{f.timer.mode === "long_break" ? "Long Break Active" : "5-Minute Break Active"}</span>
            </span>
            <span className="font-mono text-emerald-300 font-bold tabular-nums text-sm">{mmss(f.remaining)}</span>
          </div>
          <p className="m-0 font-sans text-zinc-300 leading-relaxed text-xs">
            <AppleText
              text="Great focus session! Step away from the screen, stretch your body, rest your eyes, and drink some water 💧🚶"
              size={14}
            />
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void f.stop()}
              className="h-8 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-zinc-200 px-3 font-sans text-xs font-medium transition-all"
            >
              Skip Break & Resume Focus
            </button>
          </div>
        </div>
      )}

      {/* Interval Mechanical Switcher */}
      {!f.running && (
        <div className="flex flex-col gap-1.5" role="group" aria-label="Interval presets">
          <div className="flex items-center justify-between text-xs font-sans text-zinc-400">
            <span>Interval Presets</span>
            <span className="text-zinc-300 font-medium">{selectedInterval === "25_5" ? "25m Study / 5m Break" : selectedInterval === "50_10" ? "50m Deep / 10m Break" : `${customMin}m Custom`}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/[0.06] bg-surface p-1">
            {INTERVAL_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={selectedInterval === p.id}
                onClick={() => setSelectedInterval(p.id)}
                className={`min-h-[32px] rounded-md font-sans text-xs font-medium transition-all duration-150 ${
                  selectedInterval === p.id
                    ? "bg-white text-zinc-950 font-semibold shadow-xs"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {selectedInterval === "custom" && (
            <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-2">
              <span className="font-sans text-xs text-zinc-400">Duration:</span>
              <div className="flex items-center gap-1">
                {[15, 30, 45, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCustomMin(m)}
                    className={`h-7 rounded-md border px-2.5 font-mono text-xs font-medium transition-all ${
                      customMin === m
                        ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                        : "border-white/[0.06] bg-transparent text-zinc-400 hover:text-white"
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modern Circular Instrument Gauge & Monolithic Timer */}
      <div className="relative size-44 mx-auto flex items-center justify-center my-1">
        <svg className="size-full -rotate-90 transform" viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r={RADIUS} className="stroke-white/[0.06]" strokeWidth="5" fill="transparent" />
          <circle
            cx="80"
            cy="80"
            r={RADIUS}
            className={`transition-all duration-300 ease-out ${isFocusMode ? "stroke-sky-400" : "stroke-emerald-400"}`}
            strokeWidth="5"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </svg>

        <div role="timer" aria-live="off" className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-sans text-xs font-semibold tracking-wide ${
            f.running
              ? isFocusMode
                ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              : "bg-white/[0.05] text-zinc-400 border border-white/[0.06]"
          }`}>
            {f.running ? f.label : "READY"}
          </span>

          <span className="font-mono tabular-nums text-4xl sm:text-5xl font-bold tracking-tight text-white leading-none my-1">
            {mmss(shown)}
          </span>

          <span className="font-sans text-xs text-zinc-400">{f.next}</span>
        </div>
      </div>

      {/* Integrated Collapsible Scratchpad */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-surface p-3.5">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setScratchOpen(!scratchOpen)}
            className="flex items-center gap-2 font-sans text-xs font-medium text-zinc-300 hover:text-white"
          >
            <Icon d={ICONS.edit} size={14} className="text-zinc-400" />
            <span>Session Scratchpad</span>
            <span className="font-mono text-[11px] text-zinc-500">{scratchOpen ? "▲" : "▼"}</span>
          </button>
          {scratchpad.trim() && act && (
            <button
              type="button"
              disabled={savingScratch}
              onClick={() => void handleSaveScratchToCapture()}
              className="font-sans text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
            >
              {savingScratch ? "Saving…" : "Save to Captures →"}
            </button>
          )}
        </div>

        {scratchOpen && (
          <div className="flex flex-col gap-2">
            <textarea
              rows={3}
              value={scratchpad}
              onChange={(e) => {
                const val = e.target.value;
                setScratchpad(val);
                try {
                  localStorage.setItem("focus_scratchpad", val);
                } catch {
                  /* optional */
                }
              }}
              placeholder="Jot rough formulas, quick notes, or distraction thoughts here..."
              className="w-full resize-none rounded-lg border border-white/[0.06] bg-bg px-3 py-2 font-sans text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-sky-500/40 focus:outline-hidden leading-relaxed"
            />
            <div className="flex items-center justify-between text-[11px] text-zinc-500 font-sans">
              <span>Auto-saved to memory</span>
              {scratchpad.length > 0 && <span>{scratchpad.length} characters</span>}
            </div>
          </div>
        )}
      </div>

      {/* Procedural Ambient Sound Generator */}
      <div className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-surface p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-sans text-xs font-medium text-zinc-300">
            <Icon d={ICONS.zen} size={13} stroke={2} />
            <span>Ambient Sound Generator</span>
          </div>
          {ambient !== "none" && (
            <span className="font-sans text-[11px] text-sky-400 font-medium animate-pulse">● Active</span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-1">
          {[
            { id: "rain", label: "Rain" },
            { id: "binaural", label: "Beta" },
            { id: "whitenoise", label: "White" },
            { id: "cafe", label: "Café" },
          ].map((snd) => {
            const active = ambient === snd.id;
            return (
              <button
                key={snd.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleAmbient(snd.id as any)}
                className={`min-h-[32px] rounded-md border font-sans text-xs font-medium transition-all duration-150 active:scale-95 ${
                  active
                    ? "border-sky-500/40 bg-sky-500/20 text-sky-300 shadow-xs"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-white"
                }`}
              >
                {snd.label}
              </button>
            );
          })}
        </div>

        {ambient !== "none" && (
          <div className="mt-1 flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
            <span className="font-sans text-[11px] text-zinc-400">Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Ambient volume"
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="h-1 w-28 accent-sky-400 bg-white/[0.1] rounded-full cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleAmbient("none")}
              className="font-sans text-[11px] text-zinc-400 hover:text-rose-400"
            >
              Mute
            </button>
          </div>
        )}
      </div>

      {/* Main Controls - 44px touch targets */}
      <div className="flex gap-2 self-stretch">
        {f.running ? (
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-xl border border-white/20 bg-white hover:bg-zinc-100 text-zinc-950 font-sans text-xs font-semibold tracking-wide transition-all active:scale-[0.98] shadow-xs cursor-pointer"
            onClick={f.stop}
          >
            {isFocusMode ? "Stop Cycle" : "Skip Break"}
          </button>
        ) : (
          <>
            <select
              aria-label="Subject"
              value={f.subject}
              onChange={(e) => f.setSubject(e.target.value)}
              className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-surface px-3 font-sans text-xs font-medium text-white focus:border-sky-400 transition-all cursor-pointer"
            >
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button
              type="button"
              className="min-h-[44px] px-6 rounded-xl border border-transparent bg-white hover:bg-zinc-100 text-zinc-950 font-sans text-xs font-semibold tracking-wide transition-all active:scale-[0.98] shadow-xs cursor-pointer"
              onClick={handleStart}
            >
              Start Focus
            </button>
          </>
        )}
      </div>

      {onOpenZen && (
        <button
          type="button"
          onClick={onOpenZen}
          className="flex min-h-[38px] items-center justify-center gap-2 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.08] hover:text-white py-2 font-sans text-xs font-medium text-zinc-300 transition-all"
        >
          <AppleEmoji emoji="🧘" size={15} />
          <span>Zen Studio</span>
          <kbd className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">F</kbd>
        </button>
      )}

      {f.note && <p role="status" className="m-0 text-center font-sans text-xs text-zinc-300">{f.note}</p>}
    </Card>
  );
}

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
              <div className="text-xs font-sans text-zinc-300 truncate">
                {f.timer.mode === "focus" ? `${f.subjectName} · ${f.roundText}` : f.label}
              </div>
            </div>
            {onOpenZen && (
              <button
                type="button"
                onClick={onOpenZen}
                aria-label="Zen mode"
                className="flex size-11 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:text-white transition-all active:scale-95"
              >
                <AppleEmoji emoji="🧘" size={16} />
              </button>
            )}
            <button
              type="button"
              className="min-h-[44px] px-3.5 rounded-lg border border-transparent bg-white text-zinc-950 font-sans text-xs font-semibold tracking-wide active:scale-95 transition-all shadow-xs"
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
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-sky-400/40 bg-fg text-zinc-950 font-mono font-bold text-lg active:scale-95 hover:opacity-90 transition-all shadow-sm"
          >
            +
          </button>
        )}
      </div>
      {f.note && <p role="status" className="m-0 mt-1 text-center font-sans text-xs text-zinc-300">{f.note}</p>}
    </div>
  );
}
