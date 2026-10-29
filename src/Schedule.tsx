import { useEffect, useId, useRef, useState } from "react";
import type { Act, ScheduleBlock, State } from "./api.ts";
import { CalendarModal } from "./CalendarModal.tsx";
import { GoogleSyncModal } from "./GoogleSyncModal.tsx";
import { conflictFixes, getScheduleBlockGCalUrl } from "./calendar-utils.ts";
import { AppleText, Btn, Card, H2, ICONS, Icon, PageHeader, Pill } from "./ui.tsx";

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

const CATEGORY_STYLES: Record<string, { border: string; bg: string; text: string; badge: string; icon: string }> = {
  morning: { border: "border-line", bg: "bg-surface3", text: "text-warn", badge: "bg-surface3 text-warn", icon: ICONS.sun },
  school: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", icon: ICONS.syllabus },
  revision: { border: "border-line", bg: "bg-surface3", text: "text-accent", badge: "bg-surface3 text-accent", icon: ICONS.flash },
  practice: { border: "border-line", bg: "bg-surface3", text: "text-good", badge: "bg-surface3 text-good", icon: ICONS.target },
  winddown: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", icon: ICONS.moon },
  custom: { border: "border-line", bg: "bg-surface3", text: "text-muted", badge: "bg-surface3 text-muted", icon: ICONS.target },
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
    <div className="flex w-full flex-col gap-4 md:gap-6">
      <PageHeader title="Schedule" sub="Time blocks for today. Shift them when plans slip." />
      {/* Hero Header & Google Calendar Integration Banner */}
      <Card labelledBy={`${uid}-hero-h`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-surface3 text-fg">
              <Icon d={ICONS.clock} size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <H2 id={`${uid}-hero-h`}>Today's blocks</H2>
                <Pill accent>IST live</Pill>
              </div>
              <p className="m-0 text-sm text-muted mt-0.5">
                Current IST: <strong className="text-fg">{currentTime.timeStr}</strong> · Real-time schedule tracks with Google Calendar feed sync
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Btn kind={state.googleSync?.connected ? "secondary" : "primary"} onClick={() => setShowGoogleSyncModal(true)}>
              <Icon d={state.googleSync?.connected ? ICONS.refresh : ICONS.link} size={16} />
              <span>{state.googleSync?.connected ? "Google Live Sync" : "Connect Google Calendar"}</span>
              {state.googleSync?.connected && <span aria-hidden="true" className="size-2 rounded-full bg-accent" />}
            </Btn>
            <Btn kind="secondary" onClick={() => setShowCalendarModal(true)}>
              <Icon d={ICONS.today} size={16} />
              <span>iCal Feed</span>
            </Btn>
          </div>
        </div>

        {/* Quick-Tap Time Shifting Toolbar (For real-world study delays) */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface2 p-4 text-sm ring-1 ring-line">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-fg text-sm">Running late?</span>
            <span className="text-sm text-muted hidden sm:inline">Shift every block below</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Btn onClick={() => handleShiftTime(-15)} title="Shift schedule 15m earlier">−15m</Btn>
            <Btn onClick={() => handleShiftTime(15)} title="Shift schedule 15m later">+15m</Btn>
            <Btn onClick={() => handleShiftTime(30)} title="Shift schedule 30m later">+30m</Btn>
            <Btn kind="ghost" onClick={handleResetSchedule} title="Reset to default CBSE schedule">Reset</Btn>
          </div>
        </div>

        {/* The live region stays mounted so screen readers announce text swapped into it. */}
        <div role="status">
          {shiftFeedback && (
            <div className="mt-2 text-sm text-accent bg-accent/15 border border-accent/30 px-3 py-1.5 rounded-lg animate-fade-in flex items-center gap-2">
              <Icon d={ICONS.check} size={14} stroke={2.4} />
              <span>{shiftFeedback}</span>
            </div>
          )}
        </div>
      </Card>

      {/* Overlap Conflict Alert Banner: every clash, each with its own fixes */}
      {state.scheduleConflicts && state.scheduleConflicts.length > 0 && (
        <div role="alert" className="rounded-2xl bg-warn/10 ring-1 ring-warn/30 p-4 text-warn flex flex-col gap-3 animate-fade-in">
          <div className="flex items-start gap-3">
            <Icon d={ICONS.alert} size={20} />
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
                      <Btn kind="primary" onClick={() => handleShiftTime(fix.moveBy!, c.blockId)} title="Delays this block and every block after it by the same amount">
                        Move block after {c.eventSummary} (+{fix.moveBy}m)
                      </Btn>
                    )}
                    {fix.shorten && (
                      <Btn kind="outline" onClick={() => void trimBlock(c.blockId, fix.shorten!)}>
                        Shorten block to {fix.shorten.startTime ? `${fix.shorten.startTime}–${c.blockEnd}` : `${c.blockStart}–${fix.shorten.endTime}`}
                      </Btn>
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
              <Icon d={ICONS.today} size={16} />
              <span className="font-sans text-sm font-semibold text-fg">
                Google Calendar Events Today ({state.externalEvents.length})
              </span>
            </div>
<Btn kind="ghost" onClick={() => setShowGoogleSyncModal(true)}>Sync details</Btn>
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
                      <span className="ml-1.5 rounded px-1 py-0.2 bg-surface3 text-muted text-xs font-bold">
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
            className="inline-flex min-h-[44px] md:min-h-[38px] items-center rounded-full bg-accent hover:bg-accent-hover text-accent-text font-sans font-semibold text-sm px-4 transition-all cursor-pointer shrink-0 focus-visible:ring-2 focus-visible:ring-focus"
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
                <div className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-2.5 py-0.5 text-xs font-sans font-bold text-accent  ">
                  <span className="size-2 rounded-full bg-accent animate-pulse" />
                  <span>Now Active</span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div
                    className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.border} border`}
                  >
                    <Icon d={style.icon} size={20} />
                  </div>

                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="m-0 font-sans text-sm font-semibold text-fg truncate">
                        <AppleText text={block.title} size={15} />
                      </h3>
                      <span className={`rounded-md px-1.5 py-0.5 font-mono text-xs  font-semibold ${style.badge}`}>
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
                <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 sm:pt-0">
                  {/* Opens Google Calendar's "new event" page prefilled; nothing is saved until you save it there */}
                  <a
                    href={gcalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${block.title} in Google Calendar`}
                    className="min-h-[44px] md:min-h-[38px] shrink-0 rounded-full px-4 text-sm font-medium inline-flex items-center justify-center gap-1.5 border border-line bg-surface2 hover:bg-surface3 text-fg focus-visible:ring-2 focus-visible:ring-focus"
                    title="Opens Google Calendar with this block filled in; you save it there"
                  >
                    <Icon d={ICONS.today} size={14} />
                    <span className="hidden sm:inline">Open in Google Calendar</span>
                  </a>

                  {/* Creates or updates the event through the connected Google account */}
                  <Btn
                    className={synced ? "text-good" : ""}
                    onClick={() => (state.googleSync?.connected && !state.googleSync.needsReauth ? void pushToGoogle(block) : setShowGoogleSyncModal(true))}
                    title="Creates or updates this block's event in your connected Google Calendar"
                  >
                    {!state.googleSync?.connected ? "Connect Google" : state.googleSync.needsReauth ? "Reconnect Google" : synced ? "Synced ✓ · Update" : "Sync to Google Calendar"}
                  </Btn>

                  <Btn onClick={() => handleShiftTime(15, block.id)} title="Delay this block and following blocks by 15m">+15m</Btn>

                  {isCurrent && state.timer.mode === "idle" && (
                    <Btn kind="primary" onClick={() => onStartFocus?.()}>Start Focus</Btn>
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
