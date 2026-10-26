import { useEffect, useId, useRef, useState } from "react";
import type { Act, State } from "./api.ts";
import { getCalendarFeedUrls } from "./calendar-utils.ts";
import { AppleEmoji, Btn, Card, H2 } from "./ui.tsx";

export function CalendarModal({
  state,
  act,
  onClose,
}: {
  state: State;
  act: Act;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [resetting, setResetting] = useState(false);
  const resetBusy = useRef(false);
  const modalId = useId();

  const { httpFeedUrl, webcalUrl, gcalSubscribeUrl } = getCalendarFeedUrls(
    state.calendarToken || ""
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(httpFeedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      prompt("Copy your private calendar feed URL:", httpFeedUrl);
    }
  };

  const handleResetToken = async () => {
    if (resetBusy.current) return;
    if (
      !confirm(
        "Are you sure you want to regenerate your calendar token? Any existing calendar subscriptions will need to be re-subscribed with the new URL."
      )
    ) {
      return;
    }
    resetBusy.current = true;
    setResetting(true);
    try {
      await act("POST", "/api/calendar/token/reset");
    } finally {
      resetBusy.current = false;
      setResetting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${modalId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
    >
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-line bg-bg p-6 text-fg shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-focus/10 border border-focus/20 text-focus">
              <AppleEmoji emoji="📅" size={22} />
            </div>
            <div>
              <h2
                id={`${modalId}-title`}
                className="font-sans text-base font-semibold text-fg tracking-tight"
              >
                Google Calendar & iCal Live Sync
              </h2>
              <p className="m-0 text-xs text-muted">
                Subscribe once to sync CBSE exam dates, daily routine blocks, and school deliverables
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-muted hover:text-fg hover:bg-surface3 transition-all cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Sync Stream Preview Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3">
            <AppleEmoji emoji="📝" size={18} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-fg">CBSE Timetable</span>
              <span className="text-[11px] text-muted">Exam slots (10:30–13:30)</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3">
            <AppleEmoji emoji="🌅" size={18} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-fg">Routine Blocks</span>
              <span className="text-[11px] text-muted">Morning, School, Review</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface p-3">
            <AppleEmoji emoji="📋" size={18} />
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-fg">Deliverables</span>
              <span className="text-[11px] text-muted">Lab manuals & due dates</span>
            </div>
          </div>
        </div>

        {/* Primary 1-Click Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          <a
            href={gcalSubscribeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full rounded-xl bg-fg hover:opacity-90 text-bg font-sans font-semibold text-xs py-3 px-4 shadow-lg active:scale-[0.99] transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
            </svg>
            <span>Subscribe in Google Calendar</span>
            <span className="text-[11px] opacity-75 font-mono">(1-Click Add)</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={copyUrl}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-line bg-surface2 hover:bg-surface3 text-fg font-sans font-medium text-xs py-2.5 px-3 transition-all cursor-pointer"
            >
              {copied ? (
                <span>✓ Feed URL Copied!</span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <AppleEmoji emoji="📋" size={14} />
                  <span>Copy iCal Feed URL</span>
                </span>
              )}
            </button>

            <a
              href={httpFeedUrl}
              download="study-calendar.ics"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-line bg-surface2 hover:bg-surface3 text-fg/80 hover:text-fg font-sans font-medium text-xs py-2.5 px-3 transition-all"
            >
              <AppleEmoji emoji="⬇️" size={14} />
              <span>Download .ICS</span>
            </a>
          </div>
        </div>

        {/* Feed URL Display */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-center justify-between text-xs font-mono text-muted">
            <span>YOUR PRIVATE SUBSCRIPTION URL</span>
            <span className="text-accent text-[11px] font-sans">● Protected & Signed</span>
          </div>
          <div className="rounded-lg bg-black/40 border border-line p-2 font-mono text-xs text-fg/80 break-all select-all">
            {httpFeedUrl}
          </div>
          <div className="flex items-center justify-between text-[11px] text-muted pt-1 font-sans">
            <span>Enforces Asia/Kolkata (IST, UTC+5:30) timezone automatically.</span>
            <button
              type="button"
              onClick={handleResetToken}
              disabled={resetting}
              className="text-muted hover:text-danger underline cursor-pointer transition-colors"
            >
              {resetting ? "Resetting..." : "Regenerate Token"}
            </button>
          </div>
        </div>

        {/* Multi-Account & Client Guidance */}
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-surface/70 p-3.5 text-xs text-fg/80">
          <div className="flex items-center gap-2 font-semibold text-fg">
            <AppleEmoji emoji="💡" size={16} />
            <span>Multiple Google Accounts & Phone Setup</span>
          </div>
          <p className="m-0 text-xs text-muted leading-relaxed">
            Using a different Google account for your calendar? Clicking{" "}
            <strong className="text-fg">Subscribe in Google Calendar</strong> opens your browser where you can pick or switch to any Google account. For Apple Calendar or Outlook, copy the Feed URL and paste it into <em>File → New Calendar Subscription</em>.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-line">
          <Btn kind="ghost" onClick={onClose} className="px-4 py-1.5 text-xs">
            Close
          </Btn>
        </div>
      </div>
    </div>
  );
}
