import { useEffect, useState } from "react";
import type { State } from "./api.ts";
import { getCurrentAmbient, getAmbientVolume, playAmbientSound, setAmbientVolume, stopAmbientSound } from "./ambientAudio.ts";
import type { FocusModel } from "./Focus.tsx";
import { Btn } from "./ui.tsx";

const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// Concentric session ring radii
// Outer = 240 min sprint, Middle = 180 min deep study, Inner = 90 min daily baseline
const RINGS = [
  { targetMin: 90, r: 120, color: "var(--accent)", label: "90m Base" },
  { targetMin: 180, r: 140, color: "#818cf8", label: "180m Deep" },
  { targetMin: 240, r: 160, color: "var(--good)", label: "240m Sprint" },
];

export function ZenFocusStudio({
  focus,
  state,
  onClose,
}: {
  focus: FocusModel;
  state: State;
  onClose: () => void;
}) {
  const f = focus;
  const isFocusMode = f.timer.mode === "focus";
  const [ambient, setAmbient] = useState<"none" | "binaural" | "rain" | "whitenoise" | "cafe">(getCurrentAmbient);
  const [volume, setVol] = useState<number>(getAmbientVolume);

  // Calculate total focus time today in minutes
  const todayFocusMins = state.sessions
    .filter((s) => s.day === state.today)
    .reduce((acc, s) => acc + s.minutes, 0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "f") {
        onClose();
      }
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "SELECT") {
        e.preventDefault();
        if (f.running) f.stop();
        else f.start();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [f.running, f.stop, f.start, onClose]);

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

  // Main countdown arc (large center ring: r=190)
  const CENTER_R = 190;
  const CIRCUMFERENCE = 2 * Math.PI * CENTER_R;
  const countdownArc = f.running ? (f.remaining / f.total) * CIRCUMFERENCE : CIRCUMFERENCE;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Zen Focus Studio"
      className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-[#050608]/98 backdrop-blur-3xl p-6 sm:p-10 text-white animate-fade-in select-none"
    >
      {/* Top Telemetry & Escape Action */}
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
        <div className="flex items-center gap-3">
          <div className="size-2.5 rounded-full bg-accent animate-pulse shadow-[0_0_12px_var(--accent)]" />
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-accent-text">
            ZEN FOCUS STUDIO · {isFocusMode ? "DEEP WORK" : f.label.toUpperCase()}
          </span>
          <span className="text-white/20">/</span>
          <span className="font-mono text-xs text-white/50">{f.roundText}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline font-mono text-xs text-white/40">
            Press <kbd className="rounded bg-white/10 px-1.5 py-0.5 border border-white/10 text-white/70">Esc</kbd> or <kbd className="rounded bg-white/10 px-1.5 py-0.5 border border-white/10 text-white/70">F</kbd> to exit
          </span>
          <button
            type="button"
            aria-label="Exit Zen Focus Studio"
            onClick={onClose}
            className="flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 font-mono text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white transition-all active:scale-95"
          >
            ✕ Exit Zen Mode
          </button>
        </div>
      </div>

      {/* Center Studio Area: Layered Concentric Activity Rings & Pomodoro Countdown */}
      <div className="my-auto flex flex-col items-center justify-center py-6">
        <div className="relative size-[380px] sm:size-[440px] flex items-center justify-center">
          {/* Ambient dynamic radial illumination */}
          <div
            className={`pointer-events-none absolute inset-0 rounded-full blur-3xl transition-opacity duration-1000 ${
              isFocusMode && f.running
                ? "bg-accent/20 opacity-100"
                : f.running
                ? "bg-good/20 opacity-100"
                : "bg-accent/10 opacity-40"
            }`}
          />

          <svg
            width="440"
            height="440"
            viewBox="0 0 440 440"
            role="img"
            aria-label={`Zen timer: ${mmss(f.running ? f.remaining : f.total)} remaining`}
            className="-rotate-90 size-full max-w-full max-h-full"
          >
            {/* Concentric Daily Target Activity Rings */}
            {RINGS.map(({ targetMin, r, color }) => {
              const ringCirc = 2 * Math.PI * r;
              const pct = Math.min(1, todayFocusMins / targetMin);
              const strokeOffset = ringCirc * (1 - pct);
              return (
                <g key={targetMin} className="opacity-80">
                  {/* Background track */}
                  <circle
                    cx="220"
                    cy="220"
                    r={r}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="4"
                  />
                  {/* Progress stroke */}
                  <circle
                    cx="220"
                    cy="220"
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeDasharray={ringCirc}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                    style={{ filter: `drop-shadow(0 0 6px ${color})` }}
                  />
                </g>
              );
            })}

            {/* Main Outer Pomodoro Countdown Ring */}
            <circle
              cx="220"
              cy="220"
              r={CENTER_R}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="10"
            />
            {f.running && (
              <circle
                cx="220"
                cy="220"
                r={CENTER_R}
                fill="none"
                stroke={isFocusMode ? "var(--accent)" : "var(--good)"}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${countdownArc} ${CIRCUMFERENCE}`}
                className={`timer-ring transition-all duration-500 ease-linear ${
                  isFocusMode
                    ? "[filter:drop-shadow(0_0_16px_rgba(99,102,241,0.85))]"
                    : "[filter:drop-shadow(0_0_16px_rgba(52,211,153,0.85))]"
                }`}
              />
            )}
          </svg>

          {/* Centered Monolithic Countdown Typography */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
            <div className="mb-2">
              <span
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-wider backdrop-blur-md ${
                  f.running
                    ? "border-accent/40 bg-accent/20 text-accent-text shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                    : "border-white/10 bg-white/5 text-white/60"
                }`}
              >
                {f.running && <span className="size-1.5 rounded-full bg-accent animate-pulse" />}
                {f.running ? (isFocusMode ? f.subjectName : f.label) : "Ready to Focus"}
              </span>
            </div>

            <div className="font-mono text-[64px] sm:text-[84px] font-bold tracking-tighter tabular-nums leading-none text-white drop-shadow-[0_4px_30px_rgba(255,255,255,0.2)]">
              {mmss(f.running ? f.remaining : f.total)}
            </div>

            <div className="mt-3 flex items-center gap-2 font-mono text-xs text-white/50">
              <span>{f.next}</span>
            </div>

            {/* Quick Action Buttons inside Zen Center */}
            <div className="mt-6 flex items-center gap-3">
              {f.running ? (
                <button
                  type="button"
                  onClick={f.stop}
                  className="h-11 rounded-full border border-red-500/40 bg-red-500/20 px-6 font-mono text-xs font-semibold uppercase tracking-wider text-red-300 hover:bg-red-500/30 transition-all active:scale-95"
                >
                  {isFocusMode ? "Stop Session" : "Skip Break"}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Study Subject"
                    value={f.subject}
                    onChange={(e) => f.setSubject(e.target.value)}
                    className="h-11 rounded-full border border-white/20 bg-white/10 px-4 font-mono text-xs font-semibold text-white focus:outline-none"
                  >
                    {state.subjects.map((s) => (
                      <option key={s.id} value={s.id} className="bg-[#0b0d13] text-white">
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={f.start}
                    className="h-11 rounded-full border border-accent bg-accent px-8 font-mono text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(99,102,241,0.6)] hover:brightness-110 transition-all active:scale-95"
                  >
                    ▶ Start Focus
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Concentric Daily Rings Legend */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs font-mono text-white/60">
          <span className="text-white/40">Daily Rings ({todayFocusMins}m logged):</span>
          {RINGS.map(({ targetMin, color, label }) => {
            const done = todayFocusMins >= targetMin;
            return (
              <span key={targetMin} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                <span className={done ? "text-white font-semibold" : ""}>{label} ({done ? "✓" : `${todayFocusMins}/${targetMin}m`})</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Bottom Ambient Sound Generator & Web Audio Synthesizer */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/[0.08] pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-white/50">
            Ambient Soundscape:
          </span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ambient Sound Generator">
            {[
              { id: "none", label: "Mute" },
              { id: "binaural", label: "🧠 14Hz Binaural Beats" },
              { id: "rain", label: "🌧️ Calming Rain" },
              { id: "whitenoise", label: "📻 Deep Noise" },
              { id: "cafe", label: "☕ Warm Café" },
            ].map((snd) => (
              <button
                key={snd.id}
                type="button"
                aria-pressed={ambient === snd.id}
                onClick={() => handleAmbientChange(snd.id as typeof ambient)}
                className={`h-9 rounded-xl border px-3.5 font-mono text-xs font-medium transition-all active:scale-95 ${
                  ambient === snd.id
                    ? "border-accent bg-accent/25 text-accent-text font-semibold shadow-[0_0_12px_rgba(99,102,241,0.3)]"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                {snd.label}
              </button>
            ))}
          </div>
        </div>

        {ambient !== "none" && (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-white/50">Volume:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              aria-label="Ambient volume"
              className="w-24 accent-accent cursor-pointer"
            />
            <span className="font-mono text-xs text-white/60">{Math.round(volume * 100)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
