import { useEffect, useId, useRef, useState } from "react";
import type { Act, ScheduleBlock, State } from "./api.ts";
import { CalendarModal } from "./CalendarModal.tsx";
import { GoogleSyncModal } from "./GoogleSyncModal.tsx";
import { conflictFixes, getScheduleBlockGCalUrl } from "./calendar-utils.ts";
import { AppleEmoji, AppleText, Card, H2, PageHeader } from "./ui.tsx";

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
  morning: { border: "border-line", bg: "bg-surface3", text: "text-warn", badge: "bg-surface3 text-warn", emoji: "🌅" },
  school: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", emoji: "🏫" },
  revision: { border: "border-line", bg: "bg-surface3", text: "text-accent", badge: "bg-surface3 text-accent", emoji: "⚡" },
  practice: { border: "border-line", bg: "bg-surface3", text: "text-good", badge: "bg-surface3 text-good", emoji: "🧠" },
  winddown: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", emoji: "🌙" },
  custom: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", emoji: "🎯" },
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
      setShiftFeedback(`Shifted ${fromId === undefined ? "schedule" : "block and those after it"} by ${deltaMins > 0 ? `+${deltaMins}m` : `${deltaMins}m`}`);
      setTimeout(() => setShiftFeedback(""), 3000);
    } finally {
      busy.current = false;
    }
  };

  const trimBlock = async (id: number, times: { startTime?: string; endTime?: string }) => {
    if (busy.current) return;
    busy.current = true;
    try {
      if (await act("PATCH", `/api/schedule/blocks/${id}`, times)) {
        setShiftFeedback("Block shortened.");
        setTimeout(() => setShiftFeedback(""), 3000);
      }
    } finally {
      busy.current = false;
    }
  };

  const pushBusy = useRef(false);
  /** First push creates the event; once linked for today, the same button updates it (a rescheduled block moves its event). */
  const pushToGoogle = async (block: ScheduleBlock) => {
    if (pushBusy.current) return;
    pushBusy.current = true;
    try {
      if (block.gcalEventId && block.gcalEventDay === state.today) {
        await act("PATCH", `/api/calendar/events/${encodeURIComponent(block.gcalEventId)}`, {
          title: `[Command Deck] ${block.title}`,
          start: `${state.today}T${block.startTime}:00+05:30`,
          end: `${state.today}T${block.endTime}:00+05:30`,
        });
      } else {
        await act("POST", "/api/google/push", { blockId: block.id, date: state.today });
      }
    } finally {
      pushBusy.current = false;
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 md:max-w-3xl md:gap-6">
      <PageHeader title="Schedule" sub="Time blocks for today. Shift them when plans slip." />
      {/* Hero Header & Google Calendar Integration Banner */}
      <Card labelledBy={`${uid}-hero-h`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-surface3 text-fg">
              <AppleEmoji emoji="⏱️" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <H2 id={`${uid}-hero-h`}>Today's blocks</H2>
                <span className="rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-[11px] font-mono text-accent font-bold">
                  IST LIVE
                </span>
              </div>
              <p className="m-0 text-xs text-muted mt-0.5">
                Current IST: <strong className="text-fg font-mono">{currentTime.timeStr}</strong> · Real-time schedule tracks with Google Calendar feed sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowGoogleSyncModal(true)}
              className={`flex min-h-[44px] md:min-h-[38px] items-center justify-center gap-2 rounded-xl px-4 font-sans font-semibold text-sm active:scale-95 transition-all cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-focus ${
                state.googleSync?.connected
                  ? "bg-accent hover:bg-accent-hover text-accent-text"
                  : "bg-fg hover:opacity-90 text-bg"
              }`}
            >
              <AppleEmoji emoji={state.googleSync?.connected ? "🔄" : "🔗"} size={15} />
              <span>{state.googleSync?.connected ? "Google Live Sync" : "Connect Google Calendar"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCalendarModal(true)}
              className="flex min-h-[44px] md:min-h-[38px] items-center justify-center gap-2 rounded-xl border border-line bg-surface2 hover:bg-surface3 text-fg font-sans font-semibold text-sm px-4 active:scale-95 transition-all cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-focus"
            >
              <AppleEmoji emoji="📅" size={15} />
              <span>iCal Feed</span>
            </button>
          </div>
        </div>

        {/* Quick-Tap Time Shifting Toolbar (For real-world study delays) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface2 p-4 text-sm ring-1 ring-line">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-fg text-sm">Real-World Study Delay?</span>
            <span className="text-sm text-muted hidden sm:inline">Tap to shift all tracks forward</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleShiftTime(-15)}
              className="min-h-[44px] md:min-h-[38px] rounded-lg border border-line bg-surface hover:bg-surface3 px-3 text-xs font-mono text-muted hover:text-fg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
              title="Shift schedule 15m earlier"
            >
              -15m
            </button>
            <button
              type="button"
              onClick={() => handleShiftTime(15)}
              className="min-h-[44px] md:min-h-[38px] rounded-lg border border-focus/40 bg-focus/10 hover:bg-focus/20 px-3 text-xs font-mono font-semibold text-focus transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
              title="Shift schedule 15m later (Study delay)"
            >
              +15m Delay
            </button>
            <button
              type="button"
              onClick={() => handleShiftTime(30)}
              className="min-h-[44px] md:min-h-[38px] rounded-lg border border-focus/40 bg-focus/10 hover:bg-focus/20 px-3 text-xs font-mono font-semibold text-focus transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
              title="Shift schedule 30m later"
            >
              +30m Delay
            </button>
            <button
              type="button"
              onClick={handleResetSchedule}
              className="min-h-[44px] md:min-h-[38px] rounded-lg border border-line bg-surface hover:bg-surface3 px-3 text-xs font-sans text-muted hover:text-fg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
              title="Reset to default CBSE schedule"
            >
              ↺ Reset
            </button>
          </div>
        </div>

        {shiftFeedback && (
          <div className="mt-2 text-xs font-sans text-accent bg-accent/15 border border-accent/30 px-3 py-1.5 rounded-lg animate-fade-in flex items-center gap-2">
            <span>✓</span>
            <span>{shiftFeedback}</span>
          </div>
        )}
      </Card>

      {/* Overlap Conflict Alert Banner: every clash, each with its own fixes */}
      {state.scheduleConflicts && state.scheduleConflicts.length > 0 && (
        <div role="alert" className="rounded-2xl bg-warn/10 ring-1 ring-warn/30 p-4 text-warn flex flex-col gap-3 animate-fade-in">
          <div className="flex items-start gap-3">
            <AppleEmoji emoji="⚠️" size={20} />
            <div className="font-semibold text-sm text-warn">
              {state.scheduleConflicts.length} Schedule Conflict{state.scheduleConflicts.length > 1 ? "s" : ""} with Google Calendar
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {state.scheduleConflicts.map((c) => {
              const fix = conflictFixes(c);
              const at = (iso: string) => iso.slice(11, 16);
              return (
                <li key={`${c.blockId}-${c.eventId}`} className="flex flex-col gap-2 rounded-xl bg-surface p-3 ring-1 ring-line">
                  <div className="text-sm text-muted">
                    <span className="font-semibold text-fg">{c.eventSummary}</span> ({at(c.eventStart)}–{at(c.eventEnd)}) clashes with <span className="font-semibold text-fg">{c.blockTitle}</span> ({c.blockStart}–{c.blockEnd}).
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {fix.moveBy !== null && (
                      <button
                        type="button"
                        onClick={() => handleShiftTime(fix.moveBy!, c.blockId)}
                        title="Delays this block and every block after it by the same amount"
                        className="min-h-[44px] md:min-h-[38px] rounded-xl bg-fg hover:opacity-90 text-bg font-sans font-semibold text-sm px-4 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        Move block after {c.eventSummary} (+{fix.moveBy}m)
                      </button>
                    )}
                    {fix.shorten && (
                      <button
                        type="button"
                        onClick={() => void trimBlock(c.blockId, fix.shorten!)}
                        className="min-h-[44px] md:min-h-[38px] rounded-xl border border-line-strong bg-surface2 hover:bg-surface3 text-fg font-sans font-semibold text-sm px-4 transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        Shorten block to {fix.shorten.startTime ? `${fix.shorten.startTime}–${c.blockEnd}` : `${c.blockStart}–${fix.shorten.endTime}`}
                      </button>
                    )}
                    {fix.moveBy === null && !fix.shorten && (
                      <span className="text-sm text-muted">Too large to fix with one tap. Edit this block's times or move the event.</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* External Google Calendar Events for Today */}
      {state.externalEvents && state.externalEvents.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl bg-surface2 p-4 ring-1 ring-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AppleEmoji emoji="📅" size={16} />
              <span className="font-sans text-sm font-semibold text-fg">
                Google Calendar Events Today ({state.externalEvents.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowGoogleSyncModal(true)}
              className="inline-flex min-h-[44px] md:min-h-[38px] items-center rounded-lg text-xs text-muted hover:text-fg font-mono cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
            >
              Sync Details →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
            {state.externalEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-surface p-3 text-sm ring-1 ring-line"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-fg truncate">
                    <AppleText text={ev.summary} size={12} />
                  </div>
                  <div className="font-mono text-xs text-muted mt-0.5">
                    {ev.startsAt.slice(11, 16)} – {ev.endsAt.slice(11, 16)} IST
                    {ev.isStudyBlock && (
                      <span className="ml-1.5 rounded px-1 py-0.2 bg-surface3 text-muted text-[11px] font-bold">
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
        <div className="rounded-2xl bg-accent/10 ring-1 ring-accent/30 p-4 text-accent flex items-center justify-between gap-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="flex size-3 rounded-full bg-accent animate-pulse" />
            <div>
              <div className="font-semibold text-sm text-accent">
                Active Focus Session Synced
              </div>
              <div className="text-sm text-muted">
                {state.timer.subjectId
                  ? `Focusing on ${state.subjects.find((s) => s.id === state.timer.subjectId)?.name || state.timer.subjectId}`
                  : "Deep Focus Round Active"}
                {activeBlock && ` · Running within ${activeBlock.title}`}
              </div>
            </div>
          </div>
          <a
            href="#today"
            className="inline-flex min-h-[44px] md:min-h-[38px] items-center rounded-xl bg-accent hover:bg-accent-hover text-accent-text font-sans font-semibold text-sm px-4 transition-all cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-focus"
          >
            Focus Bar →
          </a>
        </div>
      )}

      {/* Time-Blocking Timeline Grid */}
      <div className="flex flex-col gap-2 md:gap-3">
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
          const synced = !!block.gcalEventId && block.gcalEventDay === state.today;

          return (
            <div
              key={block.id}
              className={`relative rounded-2xl bg-surface2 p-4 transition-all ${
                isCurrent ? "ring-2 ring-accent/40" : "ring-1 ring-line"
              }`}
            >
              {isCurrent && (
                <div className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-[11px] font-sans font-bold text-accent  ">
                  <span className="size-2 rounded-full bg-accent animate-pulse" />
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
                      <h3 className="m-0 font-sans text-sm font-semibold text-fg truncate">
                        <AppleText text={block.title} size={15} />
                      </h3>
                      <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px]  font-semibold ${style.badge}`}>
                        {block.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 font-mono text-xs text-muted">
                      <span className="text-fg font-semibold">{block.startTime} – {block.endTime}</span>
                      <span>·</span>
                      <span>{Math.floor(durMins / 60) > 0 ? `${Math.floor(durMins / 60)}h ` : ""}{durMins % 60 > 0 ? `${durMins % 60}m` : ""}</span>
                    </div>
                  </div>
                </div>

                {/* Block Action Buttons */}
                <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0">
                  {/* 1-Click Export to Google Calendar */}
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] md:min-h-[38px] items-center gap-1.5 rounded-lg border border-line bg-surface hover:bg-surface3 px-3 text-xs text-muted hover:text-fg transition-all focus-visible:ring-2 focus-visible:ring-focus"
                    title="Export this block to Google Calendar"
                  >
                    <AppleEmoji emoji="📅" size={13} />
                    <span className="hidden sm:inline">Add to Cal</span>
                  </a>

                  {/* Push this block to Google Calendar, or show why it can't be */}
                  <button
                    type="button"
                    onClick={() => (state.googleSync?.connected && !state.googleSync.needsReauth ? void pushToGoogle(block) : setShowGoogleSyncModal(true))}
                    className={`min-h-[44px] md:min-h-[38px] rounded-full border border-line bg-surface hover:bg-surface3 px-3 text-xs font-medium transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus ${synced ? "text-good" : "text-muted hover:text-fg"}`}
                  >
                    {!state.googleSync?.connected ? "Connect Google" : state.googleSync.needsReauth ? "Reconnect Google" : synced ? "Synced ✓ · Update" : "Push to GCal"}
                  </button>

                  {/* Quick Shift for this block */}
                  <button
                    type="button"
                    onClick={() => handleShiftTime(15, block.id)}
                    className="min-h-[44px] md:min-h-[38px] rounded-lg border border-line bg-surface hover:bg-surface3 px-3 text-xs font-mono text-muted hover:text-fg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
                    title="Delay this block and following blocks by 15m"
                  >
                    +15m
                  </button>

                  {/* Start Focus Button if Active */}
                  {isCurrent && state.timer.mode === "idle" && (
                    <button
                      type="button"
                      onClick={() => onStartFocus?.()}
                      className="min-h-[44px] md:min-h-[38px] rounded-lg bg-accent hover:bg-accent-hover text-accent-text font-sans font-semibold text-xs px-3 transition-all cursor-pointer active:scale-95 focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      Start Focus
                    </button>
                  )}
                </div>
              </div>

              {/* Progress bar through current active block */}
              {isCurrent && (
                <div className="mt-3.5 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs font-sans text-fg/80">
                    <span>Block Elapsed: {elapsedMins}m / {durMins}m</span>
                    <span className="font-mono text-accent font-semibold">{pct}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface3 overflow-hidden">
                    <div
                      className="h-full bg-accent transition-all duration-500 rounded-full"
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
