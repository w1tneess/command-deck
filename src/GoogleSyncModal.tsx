import { useId, useRef, useState } from "react";
import { call, ReauthError, type Act, type State } from "./api.ts";
import { AppleEmoji, AppleText, Btn, H2, Segmented } from "./ui.tsx";

export function GoogleSyncModal({
  state,
  act,
  onClose,
}: {
  state: State;
  act: Act;
  onClose: () => void;
}) {
  const uid = useId();
  const busy = useRef(false);
  const [tab, setTab] = useState<"sync" | "setup">("sync");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [reauthSeen, setReauthSeen] = useState(false);

  // Manual setup form state
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [calendarId, setCalendarId] = useState("primary");

  const sync = state.googleSync;
  const events = state.externalEvents || [];
  const conflicts = state.scheduleConflicts || [];

  const handleOAuthConnect = async () => {
    if (busy.current) return;
    busy.current = true;
    setErrorMsg("");
    try {
      const res = await fetch("/api/google/auth/url");
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Failed to generate Google OAuth URL. Please check credentials in Setup tab.");
      }
      window.location.href = data.url;
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to connect to Google");
    } finally {
      busy.current = false;
    }
  };

  const handleManualSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setStatusMsg("");
    setErrorMsg("");

    try {
      const res = await call<{ ok?: boolean; warning?: string; syncedCount?: number }>("POST", "/api/google/setup", {
        clientId: clientId.trim() || undefined,
        clientSecret: clientSecret.trim() || undefined,
        refreshToken: refreshToken.trim() || undefined,
        calendarId: calendarId.trim() || "primary",
      });

      await act("GET", "/api/state");

      if (res?.warning) {
        setStatusMsg(res.warning);
      } else {
        setStatusMsg(`Saved successfully! ${res?.syncedCount ? `Synced ${res.syncedCount} events.` : ""}`);
        setTimeout(() => setStatusMsg(""), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Setup failed");
    } finally {
      busy.current = false;
    }
  };

  const handleLiveSync = async () => {
    if (busy.current || isSyncing) return;
    busy.current = true;
    setIsSyncing(true);
    setStatusMsg("");
    setErrorMsg("");

    try {
      const res = await call<{ syncedCount?: number; skipped?: boolean }>("POST", "/api/google/sync");
      await act("GET", "/api/state");
      setStatusMsg(res?.skipped ? "Two-way sync is off, so nothing was pulled." : `Synced successfully: ${res?.syncedCount ?? 0} events loaded.`);
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err: any) {
      if (err instanceof ReauthError) setReauthSeen(true);
      setErrorMsg(err.message || "Sync failed");
    } finally {
      setIsSyncing(false);
      busy.current = false;
    }
  };

  const handlePushBlocks = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatusMsg("");
    setErrorMsg("");

    try {
      const res = await call<{ pushed?: number }>("POST", "/api/google/push", { date: state.today });
      await act("GET", "/api/state");
      setStatusMsg(`Pushed ${res?.pushed ?? 0} schedule blocks to Google Calendar!`);
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err: any) {
      if (err instanceof ReauthError) setReauthSeen(true);
      setErrorMsg(err.message || "Push failed");
    } finally {
      busy.current = false;
    }
  };

  const handleTwoWay = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      await act("PUT", "/api/calendar/settings", { twoWay: !sync?.twoWay });
    } finally {
      busy.current = false;
    }
  };

  const handleTarget = async (target: "primary" | "deck") => {
    if (busy.current || target === sync?.calendarTarget) return;
    busy.current = true;
    setErrorMsg("");
    try {
      await call("POST", "/api/calendar/target", { target });
      await act("GET", "/api/state");
      setStatusMsg(target === "deck" ? "Now using the Command Deck calendar." : "Now using your primary calendar.");
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err: any) {
      if (err instanceof ReauthError) setReauthSeen(true);
      setErrorMsg(err.message || "Could not switch calendars");
    } finally {
      busy.current = false;
    }
  };

  const handleDisconnect = async () => {
    if (busy.current) return;
    if (!confirm("Disconnect Google Calendar and remove cached events?")) return;
    busy.current = true;
    try {
      await act("POST", "/api/google/disconnect");
      setStatusMsg("Disconnected from Google Calendar.");
    } catch (err: any) {
      setErrorMsg(err.message || "Disconnect failed");
    } finally {
      busy.current = false;
    }
  };

  const formatIsoTime = (iso: string) => {
    const m = iso.match(/T(\d{2}:\d{2})/);
    return m ? m[1] : iso;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${uid}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-surface2 p-5 ring-1 ring-line shadow-2xl text-fg flex flex-col gap-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-focus/10 border border-focus/20 text-focus">
              <AppleEmoji emoji="📅" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <H2 id={`${uid}-title`}>Google Calendar Two-Way Live Sync</H2>
                {sync?.connected ? (
                  <span className="flex items-center gap-1 rounded-full bg-accent/15 border border-accent/30 px-2 py-0.5 text-[11px] font-mono text-accent font-bold">
                    <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <span className="rounded-full bg-warn/15 border border-warn/30 px-2 py-0.5 text-[11px] font-mono text-warn font-bold">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-muted m-0 mt-0.5">
                Google Cloud Calendar API v3 · Bidirectional sync & conflict detection in IST
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-11 md:size-9 shrink-0 items-center justify-center rounded-full bg-surface3 hover:bg-surface3 text-muted hover:text-fg transition-all cursor-pointer text-sm focus-visible:ring-2 focus-visible:ring-focus"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher: Sync & Status vs Credentials Setup */}
        <div className="flex rounded-xl bg-surface3 p-1 text-sm font-semibold">
          <button
            type="button"
            onClick={() => setTab("sync")}
            className={`flex-1 min-h-[44px] md:min-h-[38px] rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus ${
              tab === "sync"
                ? "bg-surface2 text-fg ring-1 ring-line font-bold"
                : "text-muted hover:text-fg"
            }`}
          >
            Live Sync & Events
          </button>
          <button
            type="button"
            onClick={() => setTab("setup")}
            className={`flex-1 min-h-[44px] md:min-h-[38px] rounded-lg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus ${
              tab === "setup"
                ? "bg-surface2 text-fg ring-1 ring-line font-bold"
                : "text-muted hover:text-fg"
            }`}
          >
            OAuth & Secrets Setup
          </button>
        </div>

        {/* Status / Error Alerts */}
        {statusMsg && (
          <div className="rounded-xl border border-accent/30 bg-accent/15 p-3 text-xs text-accent flex items-center gap-2">
            <span>✓</span>
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-xs text-danger flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Live Sync & Events */}
        {tab === "sync" && (
          <div className="space-y-4">
            {/* Sync Status Card */}
            <div className="rounded-2xl bg-surface p-4 ring-1 ring-line flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                <div>
                  <div className="text-muted">Connection</div>
                  <div className="font-semibold mt-0.5">
                    {sync?.connected ? (
                      <span className="text-good">● Connected to {sync.calendarTarget === "deck" ? "the Command Deck calendar" : "your primary calendar"}</span>
                    ) : (
                      <span className="text-warn">○ Not connected to Google Calendar</span>
                    )}
                  </div>
                </div>

                {sync?.lastSyncedAt && (
                  <div className="sm:text-right">
                    <div className="text-muted">Last synced</div>
                    <div className="font-mono tabular-nums text-muted text-xs mt-0.5">
                      {sync.lastSyncedAt.replace("T", " ").slice(0, 19)} IST
                    </div>
                  </div>
                )}
              </div>

              {sync?.connected && (sync.needsReauth || reauthSeen) && (
                <div role="alert" className="flex flex-col items-start gap-2 rounded-xl bg-warn/10 p-3 text-sm text-warn ring-1 ring-warn/30">
                  <span>Google needs your permission again to read and edit your calendars.</span>
                  <Btn kind="primary" onClick={handleOAuthConnect}>Grant calendar access</Btn>
                </div>
              )}

              {sync?.connected ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div id={`${uid}-tw`} className="text-sm font-medium text-fg">Two-way sync</div>
                      <div className="text-xs text-muted">Pull your Google events and flag clashes. Off still lets you push.</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sync.twoWay}
                      aria-labelledby={`${uid}-tw`}
                      onClick={handleTwoWay}
                      className={`flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent cursor-pointer focus-visible:ring-2 focus-visible:ring-focus`}
                    >
                      <span className={`relative h-6 w-11 rounded-full transition-colors ${sync.twoWay ? "bg-accent" : "bg-surface3"}`}>
                        <span className={`absolute top-0.5 size-5 rounded-full bg-bg transition-all ${sync.twoWay ? "left-[22px]" : "left-0.5"}`} />
                      </span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <div className="text-sm font-medium text-fg">Calendar</div>
                    <Segmented
                      label="Calendar"
                      value={sync.calendarTarget}
                      onChange={handleTarget}
                      options={[["primary", "Primary"], ["deck", "Command Deck"]]}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Btn kind="primary" onClick={handleLiveSync} disabled={isSyncing}>
                      <AppleEmoji emoji="🔄" size={14} />
                      <span>{isSyncing ? "Syncing…" : "Sync now"}</span>
                    </Btn>
                    <Btn onClick={handlePushBlocks}>
                      <AppleEmoji emoji="📤" size={14} />
                      <span>Push today's study blocks</span>
                    </Btn>
                    <Btn kind="ghost" className="ml-auto text-danger hover:text-danger" onClick={handleDisconnect}>Disconnect</Btn>
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <Btn kind="primary" onClick={handleOAuthConnect} className="w-full">
                    <AppleEmoji emoji="🔗" size={16} />
                    <span>Authorize with Google Calendar</span>
                  </Btn>
                  <p className="text-xs text-muted text-center m-0">
                    If your Google Cloud app is in <em>Testing</em>, your email must be added to <strong>OAuth consent screen &gt; Test users</strong>.
                  </p>
                </div>
              )}
            </div>

            {/* Overlap Conflicts Alert if Any */}
            {conflicts.length > 0 && (
              <div className="rounded-2xl border border-warn/30 bg-warn/15 p-4 text-xs text-warn flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-warn">
                  <AppleEmoji emoji="⚠️" size={16} />
                  <span>{conflicts.length} Schedule Conflict{conflicts.length > 1 ? "s" : ""} Detected</span>
                </div>
                <div className="space-y-1.5">
                  {conflicts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 bg-warn/40 p-2 rounded-lg border border-warn/30 font-mono">
                      <span>Study: <strong>{c.blockTitle}</strong> ({c.blockStart}–{c.blockEnd})</span>
                      <span>⇄</span>
                      <span className="text-warn">Google: {c.eventSummary} ({formatIsoTime(c.eventStart)}–{formatIsoTime(c.eventEnd)})</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-warn/80 m-0">
                  Tip: Use the quick "+15m Delay" button on the Schedule board to shift study blocks around external appointments.
                </p>
              </div>
            )}

            {/* Synced External Events List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted">
                <span className="font-semibold   text-xs">
                  Today's Google Calendar Events ({events.length})
                </span>
                <span className="text-xs font-mono">Date: {state.today}</span>
              </div>

              {events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line p-6 text-center text-xs text-muted">
                  {sync?.connected
                    ? "No external events scheduled on Google Calendar for today."
                    : "Connect your Google Calendar or perform a sync to display external events."}
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`size-2.5 rounded-full shrink-0 ${ev.isStudyBlock ? "bg-fg" : "bg-fg"}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-fg truncate">
                            <AppleText text={ev.summary} size={13} />
                          </div>
                          <div className="font-mono text-xs text-muted mt-0.5">
                            {formatIsoTime(ev.startsAt)} – {formatIsoTime(ev.endsAt)}
                            {ev.isStudyBlock && (
                              <span className="ml-2 rounded px-1 py-0.2 bg-focus/20 text-focus text-[11px]">
                                Study Block
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm(`Delete event "${ev.summary}" from Google Calendar?`)) return;
                          await act("DELETE", `/api/google/events/${ev.id}`);
                        }}
                        className="text-muted hover:text-danger p-1.5 transition-colors cursor-pointer text-xs"
                        title="Delete from Google Calendar"
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Manual Credentials & Setup */}
        {tab === "setup" && (
          <form onSubmit={handleManualSetup} className="space-y-4 text-xs">
            <div className="rounded-xl border border-line bg-surface p-3.5 text-fg/80 space-y-2">
              <p className="font-semibold text-fg m-0">Google Cloud Console Checklist</p>
              <ul className="text-xs text-muted m-0 space-y-1 list-disc list-inside">
                <li>Enable the <strong>Google Calendar API</strong> in Google Cloud Console.</li>
                <li>Add your email under <strong>APIs &amp; Services &gt; OAuth consent screen &gt; Test users</strong> (prevents 403 access_denied).</li>
                <li>Add <code>https://deck.advaitachandra.in/api/google/callback</code> to <strong>Authorized redirect URIs</strong>.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={`${uid}-client-id`} className="block font-medium text-fg/80 mb-1">
                  Google Client ID (Web Client)
                </label>
                <input
                  id={`${uid}-client-id`}
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-mono text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-client-secret`} className="block font-medium text-fg/80 mb-1">
                  Google Client Secret
                </label>
                <input
                  id={`${uid}-client-secret`}
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-mono text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-refresh-token`} className="block font-medium text-fg/80 mb-1">
                  OAuth Refresh Token (Optional for manual sync)
                </label>
                <input
                  id={`${uid}-refresh-token`}
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="1//04... (If you already generated an offline token)"
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-mono text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-calendar-id`} className="block font-medium text-fg/80 mb-1">
                  Calendar ID
                </label>
                <input
                  id={`${uid}-calendar-id`}
                  type="text"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="primary"
                  className="w-full rounded-xl border border-line bg-bg px-3 py-2 text-xs font-mono text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
              <button
                type="submit"
                className="rounded-xl bg-fg hover:opacity-90 text-bg font-sans font-semibold text-xs py-2 px-4 shadow-md active:scale-95 transition-all cursor-pointer"
              >
                Save Credentials & Connect
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
