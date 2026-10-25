import { useEffect, useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
import { getCurrentAmbient, getAmbientVolume, playAmbientSound, setAmbientVolume, stopAmbientSound } from "./ambientAudio.ts";
import type { FocusModel } from "./Focus.tsx";
import { AppleEmoji } from "./ui.tsx";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const TARGETS = [
  { targetMin: 90, label: "90m Base" },
  { targetMin: 180, label: "180m Deep Study" },
  { targetMin: 240, label: "240m Power Sprint" },
];

export function ZenFocusStudio({
  focus,
  state,
  onClose,
  act,
}: {
  focus: FocusModel;
  state: State;
  onClose: () => void;
  act?: Act;
}) {
  const f = focus;
  const isFocusMode = f.timer.mode === "focus";
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
  const [scratchOpen, setScratchOpen] = useState(false);
  const [savingScratch, setSavingScratch] = useState(false);
  const scratchBusy = useRef(false);

  const masteryInputId = useId();
  const scratchpadId = useId();

  // Total study minutes today
  const todayFocusMins = state.sessions
    .filter((s) => s.day === state.today)
    .reduce((acc, s) => acc + s.minutes, 0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";

      if (e.key === "Escape") {
        if (scratchOpen) {
          setScratchOpen(false);
          return;
        }
        onClose();
      }
      if (!isInput && e.key.toLowerCase() === "f") {
        onClose();
      }
      if (!isInput && e.key.toLowerCase() === "s") {
        e.preventDefault();
        setScratchOpen((prev) => !prev);
      }
      if (e.code === "Space" && !isInput) {
        e.preventDefault();
        if (f.running) f.stop();
        else f.start();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [f.running, f.stop, f.start, onClose, scratchOpen]);

  const handleAmbientChange = (type: "none" | "binaural" | "rain" | "whitenoise" | "cafe") => {
    if (type === "none") {
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

  const progressRatio = f.running ? f.remaining / f.total : 1;
  const progressPct = Math.round(progressRatio * 100);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zen Focus Studio"
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#07090e]/95 backdrop-blur-2xl p-6 sm:p-10 text-white animate-fade-in select-none"
    >
      {/* Top Telemetry & Controls */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
        <div className="flex items-center gap-3">
          <span className="size-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]" />
          <span className="text-sm font-semibold tracking-wide text-white">
            Zen Focus Studio · {isFocusMode ? "Deep Session" : f.label}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="text-xs text-zinc-400 font-medium">{f.roundText}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-pressed={scratchOpen}
            onClick={() => setScratchOpen(!scratchOpen)}
            className={`flex h-8.5 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-all ${
              scratchOpen
                ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                : "border-white/15 bg-white/[0.05] text-zinc-300 hover:text-white hover:bg-white/[0.1]"
            }`}
          >
            <AppleEmoji emoji="📝" size={14} />
            <span className="hidden sm:inline">Scratchpad [S]</span>
          </button>
          <span className="hidden md:inline text-xs text-zinc-500">
            [ESC / F] Exit · [Space] Toggle
          </span>
          <button
            type="button"
            aria-label="Exit Zen Focus Studio"
            onClick={onClose}
            className="flex h-8.5 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3.5 text-xs font-semibold text-zinc-200 hover:bg-white hover:text-zinc-950 transition-all shadow-xs"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Session Mastery Prompt Modal */}
      {f.masteryPrompt && (
        <div className="mx-auto my-3 w-full max-w-xl rounded-2xl border border-sky-500/40 bg-[#0d1322] p-5 shadow-2xl animate-fade-in">
          <div className="flex items-center justify-between pb-2">
            <span className="font-semibold text-sky-400 text-sm flex items-center gap-2">
              <AppleEmoji emoji="✨" size={15} />
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
              const input = form.elements.namedItem("zenMastery") as HTMLInputElement;
              await f.submitMasteryNote(input?.value || "");
            }}
            className="flex gap-2 mt-2"
          >
            <label htmlFor={masteryInputId} className="sr-only">What did you master this session?</label>
            <input
              id={masteryInputId}
              name="zenMastery"
              autoFocus
              placeholder="e.g. Electric potential derivation, Carbon allotropes..."
              className="flex-1 h-9 rounded-lg border border-white/15 bg-[#141a2b] px-3 font-sans text-xs text-white placeholder:text-zinc-500 focus:border-sky-400 transition-all"
            />
            <button
              type="submit"
              className="h-9 rounded-lg bg-sky-400 hover:bg-sky-300 text-zinc-950 px-4 font-sans text-xs font-semibold transition-all shadow-xs"
            >
              Save Mastery
            </button>
          </form>
        </div>
      )}

      {/* Integrated Ephemeral Scratchpad Drawer */}
      {scratchOpen && (
        <div className="mx-auto my-3 w-full max-w-xl rounded-2xl border border-white/15 bg-[#0f1420]/95 backdrop-blur-xl p-4 shadow-2xl animate-fade-in flex flex-col gap-2.5">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-2">
            <span className="font-sans text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <AppleEmoji emoji="📝" size={14} />
              <span>Focus Scratchpad (Formulas, Doubts & Ideas)</span>
            </span>
            <button
              type="button"
              onClick={() => setScratchOpen(false)}
              className="text-zinc-400 hover:text-white font-mono text-xs px-1"
            >
              ✕
            </button>
          </div>
          <label htmlFor={scratchpadId} className="sr-only">Focus scratchpad</label>
          <textarea
            id={scratchpadId}
            rows={4}
            value={scratchpad}
            placeholder="Jot formulas, quick doubts, or mental reminders without breaking flow..."
            onChange={(e) => {
              const val = e.target.value;
              setScratchpad(val);
              try { localStorage.setItem("focus_scratchpad", val); } catch {}
            }}
            className="w-full resize-none rounded-lg border border-white/10 bg-[#090c14] p-3 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-400 transition-all focus:outline-none"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="font-mono text-[10px] text-zinc-500">Auto-saved locally</span>
            {act && (
              <button
                type="button"
                disabled={!scratchpad.trim() || savingScratch}
                onClick={() => void handleSaveScratchToCapture()}
                className="h-7 rounded-md border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 font-sans text-[11px] font-semibold text-sky-300 transition-all disabled:opacity-40"
              >
                {savingScratch ? "Saving…" : "→ Push to Quick Capture"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Center Console: Beautiful distraction-free focus workspace */}
      <div className="my-auto flex flex-col items-center justify-center py-8 max-w-3xl mx-auto w-full">
        <div className="relative w-full rounded-3xl border border-white/[0.1] bg-gradient-to-b from-[#111624]/90 to-[#0c0f1a]/90 p-8 sm:p-14 flex flex-col items-center justify-center text-center shadow-2xl backdrop-blur-xl">
          {/* Ambient Glow */}
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-sky-500/10 blur-3xl rounded-full" aria-hidden="true" />

          {/* Mode Chip */}
          <div className="mb-4">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-1 text-xs font-medium tracking-wide ${
                f.running
                  ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                  : "border-white/[0.08] bg-white/[0.04] text-zinc-400"
              }`}
            >
              <span className={`size-1.5 rounded-full ${f.running ? "bg-emerald-400 animate-pulse" : "bg-zinc-500"}`} />
              {f.running ? `${isFocusMode ? f.subjectName : f.label} Active` : "Console Ready"}
            </span>
          </div>

          {/* Monolithic Tabular Numbers */}
          <div className="font-mono text-7xl sm:text-8xl lg:text-9xl font-bold tracking-tight tabular-nums leading-none text-white my-3">
            {mmss(f.running ? f.remaining : f.total)}
          </div>

          {/* Sleek Smooth Progress Bar */}
          <div className="my-6 w-full max-w-md h-2 rounded-full bg-white/[0.08] overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                isFocusMode ? "bg-gradient-to-r from-sky-400 to-indigo-500" : "bg-emerald-400"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="text-xs text-zinc-400 mb-8 font-medium">
            Next up: {f.next}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {f.running ? (
              <button
                type="button"
                onClick={f.stop}
                className="h-11 rounded-xl border border-transparent bg-white hover:bg-zinc-100 text-zinc-950 px-8 text-xs sm:text-sm font-semibold transition-all active:scale-95 shadow-md"
              >
                {isFocusMode ? "Stop Cycle" : "Skip Break"}
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <select
                  aria-label="Study Subject"
                  value={f.subject}
                  onChange={(e) => f.setSubject(e.target.value)}
                  className="h-10 rounded-[3px] border border-white/[0.14] bg-[#141724] px-4 font-mono text-xs sm:text-sm text-white focus:border-sky-400 cursor-pointer"
                >
                  {state.subjects.map((s) => (
                    <option key={s.id} value={s.id} className="bg-[#0d0f17] text-white">
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => f.start()}
                  className="h-10 rounded-[3px] border border-transparent bg-white hover:bg-zinc-100 text-zinc-950 px-8 font-mono text-xs sm:text-sm uppercase font-bold tracking-wider transition-all active:scale-95 shadow-sm inline-flex items-center gap-2"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Start Cycle</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3 Activity Target Meters */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full">
          {TARGETS.map(({ targetMin, label }) => {
            const pct = Math.min(100, Math.round((todayFocusMins / targetMin) * 100));
            const done = todayFocusMins >= targetMin;
            return (
              <div key={targetMin} className="rounded-xl border border-white/[0.08] bg-[#0f131c]/80 backdrop-blur-md p-3.5 flex flex-col gap-2">
                <div className="flex justify-between text-xs font-medium text-zinc-300">
                  <span className={done ? "text-emerald-400 font-semibold" : ""}>{label} {done ? "✓" : ""}</span>
                  <span className="text-zinc-500 font-mono text-[11px]">{todayFocusMins}/{targetMin}m ({pct}%)</span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${done ? "bg-emerald-400" : "bg-sky-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Ambient Soundscape & Mechanical Controls */}
      <div className="flex flex-wrap items-center justify-between gap-5 border-t border-white/[0.08] pt-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold tracking-wide text-zinc-400 uppercase">
            Soundscape:
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ambient Sound Generator">
            {[
              { id: "none", label: "Mute" },
              { id: "binaural", label: "14Hz Binaural" },
              { id: "rain", label: "Calming Rain" },
              { id: "whitenoise", label: "Deep Noise" },
              { id: "cafe", label: "Warm Café" },
            ].map((snd) => {
              const active = ambient === snd.id;
              return (
                <button
                  key={snd.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleAmbientChange(snd.id as typeof ambient)}
                  className={`h-8.5 rounded-lg border px-3 text-xs font-medium transition-all ${
                    active
                      ? "border-sky-500/40 bg-sky-500/20 text-sky-300 font-semibold shadow-xs"
                      : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:border-white/20 hover:text-white"
                  }`}
                >
                  {snd.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Volume Slider */}
        {ambient !== "none" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 font-medium">Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Ambient volume"
              className="h-1.5 w-24 sm:w-32 cursor-pointer appearance-none rounded-full bg-white/20 accent-sky-400 focus:outline-none"
            />
            <span className="font-mono text-xs text-zinc-400 w-8">{Math.round(volume * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
