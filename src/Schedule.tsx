import { useEffect, useId, useRef, useState } from "react";
import type { Act, ScheduleBlock, State } from "./api.ts";
import { CalendarModal } from "./CalendarModal.tsx";
import { GoogleSyncModal } from "./GoogleSyncModal.tsx";
import { getScheduleBlockGCalUrl } from "./calendar-utils.ts";
import { AppleEmoji, AppleText, Btn, Card, H2, PageHeader } from "./ui.tsx";

function getIstTimeMinutes(): { currentMinutes: number; timeStr: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).formatToParts(new Date());

  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const h = parseInt(m.hour || "0", 10);
  const min = parseInt(m.minute || "0", 10);
  return { currentMinutes: h * 60 + min, timeStr: `${m.hour}:${m.minute}` };
}

function timeStrToMinutes(str: string): number {
  const [h = "0", m = "0"] = str.split(":");
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

const CATEGORY_STYLES: Record<string, { border: string; bg: string; text: string; badge: string; emoji: string }> = {
  morning: {
    border: "border-sky-500/30",
    bg: "bg-sky-500/10",
    text: "text-sky-300",
    badge: "bg-sky-500/20 text-sky-300",
    emoji: "🌅",
  },
  school: {
    border: "border-amber-500/30",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    badge: "bg-amber-500/20 text-amber-300",
    emoji: "🏫",
  },
  revision: {
    border: "border-indigo-500/30",
    bg: "bg-indigo-500/10",
    text: "text-indigo-300",
    badge: "bg-indigo-500/20 text-indigo-300",
    emoji: "⚡",
  },
  practice: {
    border: "border-purple-500/30",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    badge: "bg-purple-500/20 text-purple-300",
    emoji: "🧠",
  },
  winddown: {
    border: "border-rose-500/30",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    badge: "bg-rose-500/20 text-rose-300",
    emoji: "🌙",
  },
  custom: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-300",
    emoji: "🎯",
  },
};

export function Schedule({
  state,
  act,
  onStartFocus,
}: {
  state: State;
  act: Act;
  onStartFocus?: (subjectId?: string) => void;
}) {
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [showGoogleSyncModal, setShowGoogleSyncModal] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<number | null>(null);
  const [shiftFeedback, setShiftFeedback] = useState("");
  const [currentTime, setCurrentTime] = useState(() => getIstTimeMinutes());
  const busy = useRef(false);
  const uid = useId();

  // Tick IST time every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(getIstTimeMinutes()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const blocks = state.scheduleBlocks || [];

  // Determine active block right now in IST
  const activeBlock = blocks.find((b) => {
    const startM = timeStrToMinutes(b.startTime);
    const endM = timeStrToMinutes(b.endTime);
    return currentTime.currentMinutes >= startM && currentTime.currentMinutes <= endM;
  });

  const handleShiftTime = async (deltaMins: number, fromId?: number) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await act("POST", "/api/schedule/shift", { deltaMins, fromId });
      setShiftFeedback(`Shifted schedule by ${deltaMins > 0 ? `+${deltaMins}m` : `${deltaMins}m`}`);
      setTimeout(() => setShiftFeedback(""), 3000);
    } finally {
      busy.current = false;
    }
  };

  const handleResetSchedule = async () => {
    if (busy.current) return;
    if (!confirm("Reset all schedule tracks back to default CBSE study hours?")) return;
    busy.current = true;
    try {
      await act("POST", "/api/schedule/reset");
      setShiftFeedback("Schedule reset to default tracks.");
      setTimeout(() => setShiftFeedback(""), 3000);
    } finally {
      busy.current = false;
    }
  };

  const handleSaveBlockEdit = async (b: ScheduleBlock, newStart: string, newEnd: string, newTitle: string) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await act("PATCH", `/api/schedule/blocks/${b.id}`, {
        startTime: newStart,
        endTime: newEnd,
        title: newTitle,
      });
      setEditingBlockId(null);
    } finally {
      busy.current = false;
    }
  };

  return (
    <div className="space-y-6 max-w-4xl w-full">
      <PageHeader eyebrow="Today, IST" title="Schedule" sub="Time blocks for the day. Shift them when plans slip." />
      {/* Hero Header & Google Calendar Integration Banner */}
      <Card labelledBy={`${uid}-hero-h`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <AppleEmoji emoji="⏱️" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <H2 id={`${uid}-hero-h`}>Today's blocks</H2>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-mono text-emerald-400 font-bold">
                  IST LIVE
                </span>
              </div>
              <p className="m-0 text-xs text-zinc-400 mt-0.5">
                Current IST: <strong className="text-zinc-200 font-mono">{currentTime.timeStr}</strong> · Real-time schedule tracks with Google Calendar feed sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowGoogleSyncModal(true)}
              className={`flex items-center justify-center gap-2 rounded-xl font-sans font-semibold text-xs py-2.5 px-3.5 shadow-md active:scale-95 transition-all cursor-pointer shrink-0 ${
                state.googleSync?.connected
                  ? "bg-emerald-500 hover:bg-emerald-400 text-zinc-950"
                  : "bg-indigo-600 hover:bg-indigo-500 text-on-solid"
              }`}
            >
              <AppleEmoji emoji={state.googleSync?.connected ? "🔄" : "🔗"} size={15} />
              <span>{state.googleSync?.connected ? "Google Live Sync" : "Connect Google Calendar"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCalendarModal(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/10 text-zinc-200 font-sans font-semibold text-xs py-2.5 px-3.5 active:scale-95 transition-all cursor-pointer shrink-0"
            >
              <AppleEmoji emoji="📅" size={15} />
              <span>iCal Feed</span>
            </button>
          </div>
        </div>

        {/* Quick-Tap Time Shifting Toolbar (For real-world study delays) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface p-3 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-zinc-300 text-xs">Real-World Study Delay?</span>
            <span className="text-xs text-zinc-500 hidden sm:inline">Tap to shift all tracks forward</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleShiftTime(-15)}
              className="rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1 text-xs font-mono text-zinc-300 hover:text-white transition-all cursor-pointer"
              title="Shift schedule 15m earlier"
            >
              -15m
            </button>
            <button
              type="button"
              onClick={() => handleShiftTime(15)}
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 text-xs font-mono font-semibold text-sky-300 transition-all cursor-pointer"
              title="Shift schedule 15m later (Study delay)"
            >
              +15m Delay
            </button>
            <button
              type="button"
              onClick={() => handleShiftTime(30)}
              className="rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 text-xs font-mono font-semibold text-sky-300 transition-all cursor-pointer"
              title="Shift schedule 30m later"
            >
              +30m Delay
            </button>
            <button
              type="button"
              onClick={handleResetSchedule}
              className="rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.06] px-2 py-1 text-xs font-sans text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Reset to default CBSE schedule"
            >
              ↺ Reset
            </button>
          </div>
        </div>

        {shiftFeedback && (
          <div className="mt-2 text-xs font-sans text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg animate-fade-in flex items-center gap-2">
            <span>✓</span>
            <span>{shiftFeedback}</span>
          </div>
        )}
      </Card>

      {/* Overlap Conflict Alert Banner */}
      {state.scheduleConflicts && state.scheduleConflicts.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in shadow-lg">
          <div className="flex items-start gap-3">
            <AppleEmoji emoji="⚠️" size={20} />
            <div>
              <div className="font-semibold text-xs text-amber-300">
                {state.scheduleConflicts.length} Schedule Conflict{state.scheduleConflicts.length > 1 ? "s" : ""} with Google Calendar
              </div>
              <div className="text-xs text-amber-200/80 font-mono mt-0.5">
                "{state.scheduleConflicts[0].eventSummary}" clashes with study block "{state.scheduleConflicts[0].blockTitle}" ({state.scheduleConflicts[0].blockStart}–{state.scheduleConflicts[0].blockEnd}).
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleShiftTime(15)}
            className="rounded-xl bg-amber-400 hover:bg-amber-300 text-zinc-950 font-sans font-semibold text-xs px-3.5 py-2 transition-all cursor-pointer shrink-0"
          >
            +15m Shift Schedule →
          </button>
        </div>
      )}

      {/* External Google Calendar Events for Today */}
      {state.externalEvents && state.externalEvents.length > 0 && (
        <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/15 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AppleEmoji emoji="📅" size={16} />
              <span className="font-sans text-xs font-semibold text-indigo-300">
                Google Calendar Events Today ({state.externalEvents.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowGoogleSyncModal(true)}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-mono cursor-pointer"
            >
              Sync Details →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {state.externalEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-bg p-2.5 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    <AppleText text={ev.summary} size={12} />
                  </div>
                  <div className="font-mono text-xs text-zinc-400 mt-0.5">
                    {ev.startsAt.slice(11, 16)} – {ev.endsAt.slice(11, 16)} IST
                    {ev.isStudyBlock && (
                      <span className="ml-1.5 rounded px-1 py-0.2 bg-indigo-500/20 text-indigo-300 text-[11px] font-bold">
                        Study Block
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Focus Session Banner if Timer is Running */}
      {state.timer.mode === "focus" && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-emerald-200 flex items-center justify-between gap-4 animate-fade-in shadow-lg">
          <div className="flex items-center gap-3">
            <span className="flex size-3 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="font-semibold text-sm text-emerald-300">
                Active Focus Session Synced
              </div>
              <div className="text-xs text-emerald-200/80">
                {state.timer.subjectId
                  ? `Focusing on ${state.subjects.find((s) => s.id === state.timer.subjectId)?.name || state.timer.subjectId}`
                  : "Deep Focus Round Active"}
                {activeBlock && ` · Running within ${activeBlock.title}`}
              </div>
            </div>
          </div>
          <a
            href="#today"
            className="rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-sans font-semibold text-xs px-3.5 py-2 transition-all cursor-pointer shrink-0"
          >
            Focus Bar →
          </a>
        </div>
      )}

      {/* Time-Blocking Timeline Grid */}
      <div className="flex flex-col gap-3">
        {blocks.map((block) => {
          const style = CATEGORY_STYLES[block.category] || CATEGORY_STYLES.custom;
          const startM = timeStrToMinutes(block.startTime);
          const endM = timeStrToMinutes(block.endTime);
          const isCurrent =
            currentTime.currentMinutes >= startM && currentTime.currentMinutes <= endM;

          const durMins = endM - startM;
          const elapsedMins = isCurrent ? Math.max(0, currentTime.currentMinutes - startM) : 0;
          const pct = isCurrent && durMins > 0 ? Math.min(100, Math.round((elapsedMins / durMins) * 100)) : 0;

          const gcalUrl = getScheduleBlockGCalUrl(block, state.today);

          return (
            <div
              key={block.id}
              className={`relative rounded-2xl border p-4.5 transition-all ${
                isCurrent
                  ? `border-emerald-500/40 bg-surface ring-2 ring-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.15)]`
                  : `border-white/[0.08] bg-bg hover:border-white/15`
              }`}
            >
              {isCurrent && (
                <div className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-sans font-bold text-emerald-400 uppercase tracking-wider">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Now Active</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.border} border`}
                  >
                    <AppleEmoji emoji={style.emoji} size={22} />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="m-0 font-sans text-sm font-semibold text-white truncate">
                        <AppleText text={block.title} size={15} />
                      </h3>
                      <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] uppercase font-semibold ${style.badge}`}>
                        {block.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 font-mono text-xs text-zinc-400">
                      <span className="text-zinc-200 font-semibold">{block.startTime} – {block.endTime}</span>
                      <span>·</span>
                      <span>{Math.floor(durMins / 60) > 0 ? `${Math.floor(durMins / 60)}h ` : ""}{durMins % 60 > 0 ? `${durMins % 60}m` : ""}</span>
                    </div>
                  </div>
                </div>

                {/* Block Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                  {/* 1-Click Export to Google Calendar */}
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white transition-all"
                    title="Export this block to Google Calendar"
                  >
                    <AppleEmoji emoji="📅" size={13} />
                    <span className="hidden sm:inline">Add to Cal</span>
                  </a>

                  {/* Quick Shift for this block */}
                  <button
                    type="button"
                    onClick={() => handleShiftTime(15, block.id)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] px-2 py-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-all cursor-pointer"
                    title="Delay this block and following blocks by 15m"
                  >
                    +15m
                  </button>

                  {/* Start Focus Button if Active */}
                  {isCurrent && state.timer.mode === "idle" && (
                    <button
                      type="button"
                      onClick={() => onStartFocus?.()}
                      className="rounded-lg bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-sans font-semibold text-xs px-3 py-1.5 transition-all cursor-pointer active:scale-95 shadow-sm"
                    >
                      Start Focus
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar through current active block */}
              {isCurrent && (
                <div className="mt-3.5 pt-3 border-t border-emerald-500/20 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs font-sans text-zinc-300">
                    <span>Block Elapsed: {elapsedMins}m / {durMins}m</span>
                    <span className="font-mono text-emerald-400 font-semibold">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-emerald-400 transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Subscription Modal */}
      {showCalendarModal && (
        <CalendarModal
          state={state}
          act={act}
          onClose={() => setShowCalendarModal(false)}
        />
      )}

      {/* Google Calendar Two-Way Live Sync Modal */}
      {showGoogleSyncModal && (
        <GoogleSyncModal
          state={state}
          act={act}
          onClose={() => setShowGoogleSyncModal(false)}
        />
      )}
    </div>
  );
}
