import { useId, useRef, useState } from "react";
import { call, type Act, type State } from "./api.ts";
import { AppleEmoji, AppleText, Btn, H2 } from "./ui.tsx";

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
      const res = await call<{ syncedCount?: number; deletedCount?: number }>("POST", "/api/google/sync");
      await act("GET", "/api/state");
      setStatusMsg(`Synced successfully: ${res?.syncedCount ?? 0} events loaded.`);
      setTimeout(() => setStatusMsg(""), 4000);
    } catch (err: any) {
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
      setErrorMsg(err.message || "Push failed");
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
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-bg p-6 shadow-2xl text-zinc-100 flex flex-col gap-5">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <AppleEmoji emoji="📅" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <H2 id={`${uid}-title`}>Google Calendar Two-Way Live Sync</H2>
                {sync?.connected ? (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] font-mono text-emerald-400 font-bold">
                    <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-mono text-amber-400 font-bold">
                    STANDBY
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 m-0 mt-0.5">
                Google Cloud Calendar API v3 · Bidirectional sync & conflict detection in IST
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full bg-white/[0.05] hover:bg-white/10 text-zinc-400 hover:text-white transition-all cursor-pointer text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher: Sync & Status vs Credentials Setup */}
        <div className="flex rounded-xl bg-white/[0.04] p-1 border border-white/[0.06] text-xs font-semibold">
          <button
            type="button"
            onClick={() => setTab("sync")}
            className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
              tab === "sync"
                ? "bg-indigo-600 text-on-solid shadow-sm font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            Live Sync & Events
          </button>
          <button
            type="button"
            onClick={() => setTab("setup")}
            className={`flex-1 py-1.5 rounded-lg transition-all cursor-pointer ${
              tab === "setup"
                ? "bg-indigo-600 text-on-solid shadow-sm font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            OAuth & Secrets Setup
          </button>
        </div>

        {/* Status / Error Alerts */}
        {statusMsg && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 flex items-center gap-2">
            <span>✓</span>
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab 1: Live Sync & Events */}
        {tab === "sync" && (
          <div className="space-y-4">
            {/* Sync Status Card */}
            <div className="rounded-2xl border border-white/[0.08] bg-surface p-4 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <div className="text-zinc-400">Connection Status:</div>
                  <div className="font-semibold text-white mt-0.5">
                    {sync?.connected ? (
                      <span className="text-emerald-400">● Connected to primary calendar</span>
                    ) : (
                      <span className="text-amber-400">○ Not connected to Google Calendar</span>
                    )}
                  </div>
                </div>

                {sync?.lastSyncedAt && (
                  <div className="sm:text-right">
                    <div className="text-zinc-400">Last Synced:</div>
                    <div className="font-mono text-zinc-200 mt-0.5">
                      {sync.lastSyncedAt.replace("T", " ").slice(0, 19)} IST
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/[0.06]">
                {sync?.connected ? (
                  <>
                    <button
                      type="button"
                      onClick={handleLiveSync}
                      disabled={isSyncing}
                      className="flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-on-solid font-sans font-semibold text-xs py-2 px-3.5 shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <AppleEmoji emoji="🔄" size={14} />
                      <span>{isSyncing ? "Syncing..." : "Sync Events Now"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handlePushBlocks}
                      className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] hover:bg-white/10 text-zinc-200 font-sans font-semibold text-xs py-2 px-3.5 active:scale-95 transition-all cursor-pointer"
                    >
                      <AppleEmoji emoji="📤" size={14} />
                      <span>Push Today's Study Blocks</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="ml-auto rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-sans text-xs py-2 px-3 transition-all cursor-pointer"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <div className="w-full space-y-1.5">
                    <button
                      type="button"
                      onClick={handleOAuthConnect}
                      className="flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-on-solid font-sans font-semibold text-xs py-2.5 px-4 shadow-md active:scale-95 transition-all cursor-pointer w-full justify-center"
                    >
                      <AppleEmoji emoji="🔗" size={16} />
                      <span>Authorize with Google Calendar (OAuth 2.0)</span>
                    </button>
                    <p className="text-xs text-zinc-400 text-center m-0">
                      If your Google Cloud app is in <em>Testing</em>, your email must be added to <strong>OAuth consent screen &gt; Test users</strong>.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Overlap Conflicts Alert if Any */}
            {conflicts.length > 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 flex flex-col gap-2">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <AppleEmoji emoji="⚠️" size={16} />
                  <span>{conflicts.length} Schedule Conflict{conflicts.length > 1 ? "s" : ""} Detected</span>
                </div>
                <div className="space-y-1.5">
                  {conflicts.map((c, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20 font-mono">
                      <span>Study: <strong>{c.blockTitle}</strong> ({c.blockStart}–{c.blockEnd})</span>
                      <span>⇄</span>
                      <span className="text-amber-300">Google: {c.eventSummary} ({formatIsoTime(c.eventStart)}–{formatIsoTime(c.eventEnd)})</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-amber-300/80 m-0">
                  Tip: Use the quick "+15m Delay" button on the Schedule board to shift study blocks around external appointments.
                </p>
              </div>
            )}

            {/* Synced External Events List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="font-semibold uppercase tracking-wider text-xs">
                  Today's Google Calendar Events ({events.length})
                </span>
                <span className="text-xs font-mono">Date: {state.today}</span>
              </div>

              {events.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-zinc-500">
                  {sync?.connected
                    ? "No external events scheduled on Google Calendar for today."
                    : "Connect your Google Calendar or perform a sync to display external events."}
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-surface p-3 text-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`size-2.5 rounded-full shrink-0 ${ev.isStudyBlock ? "bg-indigo-400" : "bg-sky-400"}`} />
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            <AppleText text={ev.summary} size={13} />
                          </div>
                          <div className="font-mono text-xs text-zinc-400 mt-0.5">
                            {formatIsoTime(ev.startsAt)} – {formatIsoTime(ev.endsAt)}
                            {ev.isStudyBlock && (
                              <span className="ml-2 rounded px-1 py-0.2 bg-indigo-500/20 text-indigo-300 text-[11px]">
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
                        className="text-zinc-500 hover:text-rose-400 p-1.5 transition-colors cursor-pointer text-xs"
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
            <div className="rounded-xl border border-white/[0.08] bg-surface p-3.5 text-zinc-300 space-y-2">
              <p className="font-semibold text-white m-0">Google Cloud Console Checklist</p>
              <ul className="text-xs text-zinc-400 m-0 space-y-1 list-disc list-inside">
                <li>Enable the <strong>Google Calendar API</strong> in Google Cloud Console.</li>
                <li>Add your email under <strong>APIs &amp; Services &gt; OAuth consent screen &gt; Test users</strong> (prevents 403 access_denied).</li>
                <li>Add <code>https://study.advaitachandra.in/api/google/callback</code> to <strong>Authorized redirect URIs</strong>.</li>
              </ul>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor={`${uid}-client-id`} className="block font-medium text-zinc-300 mb-1">
                  Google Client ID (Web Client)
                </label>
                <input
                  id={`${uid}-client-id`}
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                  className="w-full rounded-xl border border-white/10 bg-bg px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-client-secret`} className="block font-medium text-zinc-300 mb-1">
                  Google Client Secret
                </label>
                <input
                  id={`${uid}-client-secret`}
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="w-full rounded-xl border border-white/10 bg-bg px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-refresh-token`} className="block font-medium text-zinc-300 mb-1">
                  OAuth Refresh Token (Optional for manual sync)
                </label>
                <input
                  id={`${uid}-refresh-token`}
                  type="password"
                  value={refreshToken}
                  onChange={(e) => setRefreshToken(e.target.value)}
                  placeholder="1//04... (If you already generated an offline token)"
                  className="w-full rounded-xl border border-white/10 bg-bg px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor={`${uid}-calendar-id`} className="block font-medium text-zinc-300 mb-1">
                  Calendar ID
                </label>
                <input
                  id={`${uid}-calendar-id`}
                  type="text"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="primary"
                  className="w-full rounded-xl border border-white/10 bg-bg px-3 py-2 text-xs font-mono text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/[0.08]">
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 text-on-solid font-sans font-semibold text-xs py-2 px-4 shadow-md active:scale-95 transition-all cursor-pointer"
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
