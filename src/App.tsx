import { useCallback, useEffect, useState } from "react";
import { AuthError, call, type Act, type State } from "./api.ts";
import { Backup } from "./Backup.tsx";
import { CaptureDrawer } from "./Capture.tsx";
import { DeliverablesPage } from "./Deliverables.tsx";
import { FocusBar, useFocus } from "./Focus.tsx";
import { Habits } from "./Habits.tsx";
import { PinGate } from "./PinGate.tsx";
import { Projects } from "./Projects.tsx";
import { signOut } from "./session.ts";
import { Syllabus } from "./Syllabus.tsx";
import { useTheme } from "./theme.ts";
import { Today } from "./Today.tsx";
import { ICONS, Icon } from "./ui.tsx";
import { Week } from "./Week.tsx";
import { ZenFocusStudio } from "./ZenFocus.tsx";

/** `dock` marks the four tabs that sit in the phone's bottom bar; the rest live behind "More". */
const NAV = [
  { id: "today", label: "Today", phone: "Today", icon: ICONS.today, dock: true, key: "1" },
  { id: "syllabus", label: "Syllabus", phone: "Syllabus", icon: ICONS.syllabus, dock: true, key: "2" },
  { id: "habits", label: "Habits", phone: "Habits", icon: ICONS.habits, dock: true, key: "3" },
  { id: "week", label: "Week", phone: "Week", icon: ICONS.week, dock: false, key: "4" },
  { id: "deliverables", label: "Deliverables", phone: "Tasks", icon: ICONS.deliverables, dock: true, key: "5" },
  { id: "projects", label: "Projects", phone: "Projects", icon: ICONS.projects, dock: false },
  { id: "backup", label: "Backup", phone: "Backup", icon: ICONS.backup, dock: false },
] as const;
type Page = (typeof NAV)[number]["id"];

const pageFromHash = (): Page => NAV.find((n) => n.id === location.hash.slice(1))?.id ?? "today";

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);
  const [saving, setSaving] = useState(0); // writes in flight, for the loading bar
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

  const load = useCallback(async () => {
    try {
      setState(await call<State>("GET", "/api/state"));
      setNeedsLogin(false);
      setError(""); // a connection error from before is over once a refresh works
    } catch (e) {
      if (e instanceof AuthError) setNeedsLogin(true);
      else setError("Can't reach the server. Check your connection, then reload.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Keep the data fresh across devices: refresh every 20 seconds while visible, and when the tab comes back.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const id = setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  // Sync state as soon as network returns.
  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      void load();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [load]);

  // One place for every write: send it, show a clear error if it fails, then refresh.
  const act: Act = useCallback(async (method, url, body) => {
    setSaving((n) => n + 1);
    try {
      setError("");
      await call(method, url, body);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setSaving((n) => n - 1);
    }
  }, [load]);

  if (needsLogin) return <PinGate onDone={load} />;
  if (!state) return <main className="grid min-h-dvh place-items-center px-6 text-center text-muted">{error || "Loading…"}</main>;
  return <Shell state={state} act={act} reload={load} error={error} setError={setError} saving={saving > 0} online={online} />;
}

function Shell({ state, act, reload, error, setError, saving, online }: { state: State; act: Act; reload: () => Promise<void>; error: string; setError: (e: string) => void; saving: boolean; online: boolean }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useTheme();
  const focus = useFocus(state, reload, act);
  const [more, setMore] = useState(false);
  const [capture, setCapture] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const inMore = NAV.some((n) => !n.dock && n.id === page);

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); setMore(false); window.scrollTo(0, 0); };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

      if (e.key === "Escape") {
        setMore(false);
        setZenMode(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCapture((c) => !c);
      }

      // Desktop command center shortcuts (active outside input fields)
      if (!inInput) {
        if (e.key.toLowerCase() === "f") {
          e.preventDefault();
          setZenMode((z) => !z);
        }
        if (e.code === "Space") {
          e.preventDefault();
          if (focus.running) void focus.stop();
          else void focus.start();
        }
        if (e.key === "1") location.hash = "#today";
        if (e.key === "2") location.hash = "#syllabus";
        if (e.key === "3") location.hash = "#habits";
        if (e.key === "4") location.hash = "#week";
        if (e.key === "5") location.hash = "#deliverables";
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, [focus.running, focus.start, focus.stop]);

  return (
    <div className="min-h-dvh lg:flex" aria-busy={saving}>
      {saving && (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[2.5px] overflow-hidden bg-line/40">
          <div className="h-full w-1/3 animate-[slide_1s_cubic-bezier(0.4,0,0.2,1)_infinite] bg-gradient-to-r from-transparent via-accent to-transparent shadow-[0_0_8px_var(--accent)]" />
        </div>
      )}
      <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col justify-between gap-6 border-r border-line/80 bg-surface/85 backdrop-blur-2xl px-4 py-6 shadow-[4px_0_24px_rgba(0,0,0,0.18),inset_-1px_0_0_rgba(255,255,255,0.03)] lg:flex">
        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-tr from-accent to-[#818cf8] text-white shadow-[0_2px_12px_rgba(99,102,241,0.4)] border border-white/20">
              <Icon d="M9 11l3 3L22 4" size={19} stroke={2.4} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight text-fg">
                <span>Study</span>
                <span className="rounded-full bg-accent/15 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-accent-text border border-accent/25">OS</span>
              </div>
              <div className="font-mono text-[11px] text-muted tracking-tight">CLASS X · 2026-27</div>
            </div>
          </div>
          <nav aria-label="Primary" className="flex flex-col gap-1.5">
            {NAV.map((n) => {
              const active = page === n.id;
              return (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[14px] transition-all duration-150 ${
                    active
                      ? "bg-accent/15 font-semibold text-accent-text border border-accent/30 shadow-[0_2px_10px_rgba(99,102,241,0.15),inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "font-medium text-muted hover:bg-surface2/60 hover:text-fg"
                  }`}
                >
                  <Icon d={n.icon} size={19} stroke={active ? 2.2 : 1.8} />
                  <span>{n.label}</span>
                  {"key" in n && (
                    <span className="ml-auto font-mono text-[10px] text-muted/60 rounded px-1.5 py-0.5 border border-line/40 bg-surface3/40">
                      {n.key}
                    </span>
                  )}
                  {active && (
                    <span className="ml-1.5 size-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
                  )}
                </a>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-2">
          {/* Live System Telemetry Status */}
          <div className="flex items-center justify-between rounded-xl border border-line/60 bg-surface2/40 px-3 py-2 font-mono text-[11px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-good shadow-[0_0_6px_rgba(52,211,153,0.9)] animate-pulse" />
              SYSTEM ACTIVE
            </span>
            <span className="text-muted/70">IST · 24H</span>
          </div>

          {/* Fullscreen Zen Mode Button */}
          <button
            type="button"
            onClick={() => setZenMode(true)}
            className="flex h-11 items-center justify-between rounded-xl border border-line/90 bg-surface2/70 backdrop-blur-md px-3.5 text-[13px] font-medium text-fg shadow-xs transition-all hover:bg-surface2 hover:border-line hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <span>🧘</span>
              <span>Zen studio</span>
            </span>
            <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted shadow-2xs">F</kbd>
          </button>

          {/* Quick Capture Button */}
          <button
            type="button"
            onClick={() => setCapture(true)}
            className="flex h-11 items-center justify-between rounded-xl border border-line/90 bg-surface2/70 backdrop-blur-md px-3.5 text-[13px] font-medium text-fg shadow-xs transition-all hover:bg-surface2 hover:border-line hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted"><path d="M12 5v14M5 12h14"/></svg>
              Quick capture
            </span>
            <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted shadow-2xs">Ctrl K</kbd>
          </button>

          <button
            type="button"
            onClick={() => signOut("/api/logout")}
            className="h-11 rounded-xl border border-line/60 bg-transparent text-[13px] font-medium text-muted hover:bg-surface2/40 hover:text-fg hover:border-line transition-all active:scale-[0.98]"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-5 px-4 pt-5 pb-44 lg:gap-7 lg:px-10 lg:pt-8 lg:pb-12 max-w-7xl mx-auto w-full">
        {error && (
          <div role="alert" className="m-0 flex items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-950/40 text-red-200 px-4 py-3 text-[14px] font-medium backdrop-blur-md shadow-[0_4px_16px_rgba(239,68,68,0.15)]">
            <div className="flex items-center gap-2.5">
              <span className="size-2 rounded-full bg-red-400 animate-pulse" />
              <span>{error}</span>
            </div>
            <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1.5 transition-opacity hover:opacity-75">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        )}
        {!online && (
          <div role="status" className="m-0 flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-950/30 text-amber-200 px-4 py-2.5 text-[13px] backdrop-blur-md shadow-sm">
            <span className="size-2 rounded-full bg-amber-400 animate-pulse" />
            <span>You are currently offline. Changes will sync once your internet connection is restored.</span>
          </div>
        )}
        {page === "today" && <Today state={state} act={act} focus={focus} onOpenZen={() => setZenMode(true)} />}
        {page === "syllabus" && <Syllabus state={state} act={act} />}
        {page === "habits" && <Habits state={state} act={act} />}
        {page === "week" && <Week state={state} act={act} />}
        {page === "deliverables" && <DeliverablesPage state={state} act={act} />}
        {page === "projects" && <Projects state={state} act={act} />}
        {page === "backup" && <Backup reload={reload} theme={theme} setTheme={setTheme} />}
      </main>

      <FocusBar focus={focus} state={state} onToday={page === "today"} onOpenZen={() => setZenMode(true)} />

      {/* Phone: floating capture button, lifted above the timer bar when that is showing. */}
      <button
        type="button"
        aria-label="Quick capture"
        onClick={() => setCapture(true)}
        className={`fixed right-4 z-20 flex size-14 items-center justify-center rounded-full border border-white/25 bg-gradient-to-tr from-accent to-[#818cf8] text-white shadow-[0_6px_24px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.3)] transition-all active:scale-90 lg:hidden ${
          page === "today" || focus.running ? "bottom-[152px]" : "bottom-[92px]"
        }`}
      >
        <Icon d="M12 5v14 M5 12h14" size={24} stroke={2.5} />
      </button>
      {capture && <CaptureDrawer state={state} act={act} onClose={() => setCapture(false)} />}

      {/* Fullscreen Zen Focus Studio */}
      {zenMode && (
        <ZenFocusStudio focus={focus} state={state} onClose={() => setZenMode(false)} />
      )}

      {more && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden animate-fade-in" onClick={() => setMore(false)} />
          <div id="more-menu" className="fixed inset-x-3 bottom-[86px] z-40 flex flex-col gap-1 rounded-[24px] border border-line/90 bg-surface/95 backdrop-blur-2xl p-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] lg:hidden animate-drawer-mobile">
            {NAV.filter((n) => !n.dock).map((n) => {
              const active = page === n.id;
              return (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3.5 rounded-xl px-3.5 text-[15px] transition-colors ${
                    active ? "bg-accent/15 font-semibold text-accent-text border border-accent/25" : "font-medium text-fg hover:bg-surface2/60"
                  }`}
                >
                  <Icon d={n.icon} size={20} />
                  <span>{n.label}</span>
                  {active && <span className="ml-auto size-1.5 rounded-full bg-accent shadow-[0_0_6px_var(--accent)]" />}
                </a>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setZenMode(true);
              }}
              className="flex min-h-12 items-center gap-3.5 rounded-xl border-0 bg-transparent px-3.5 text-left text-[15px] font-medium text-fg hover:bg-surface2/60 transition-colors"
            >
              <span>🧘</span>
              <span>Zen Studio</span>
            </button>
            <button
              type="button"
              onClick={() => signOut("/api/logout")}
              className="flex min-h-12 items-center rounded-xl border-0 bg-transparent px-3.5 text-left text-[15px] font-medium text-muted hover:bg-surface2/60 hover:text-fg transition-colors"
            >
              Sign out
            </button>
          </div>
        </>
      )}

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[76px] items-center border-t border-line/80 bg-surface/90 backdrop-blur-2xl px-2 pb-2.5 shadow-[0_-8px_32px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.06)] lg:hidden"
      >
        {NAV.filter((n) => n.dock).map((n) => {
          const active = page === n.id;
          return (
            <a
              key={n.id}
              href={`#${n.id}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl transition-all duration-150 ${
                active ? "text-accent-text" : "text-muted hover:text-fg"
              }`}
            >
              {active && (
                <span className="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
              )}
              <Icon d={n.icon} size={22} stroke={active ? 2.3 : 1.8} />
              <span className={`text-[11px] ${active ? "font-semibold" : "font-medium"}`}>{n.phone}</span>
            </a>
          );
        })}
        <button
          type="button"
          aria-expanded={more}
          aria-controls="more-menu"
          onClick={() => setMore((m) => !m)}
          className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl border-0 bg-transparent transition-all duration-150 ${
            inMore || more ? "text-accent-text" : "text-muted hover:text-fg"
          }`}
        >
          {(inMore || more) && (
            <span className="absolute inset-x-2 -top-1 h-0.5 rounded-full bg-accent shadow-[0_0_8px_var(--accent)]" />
          )}
          <Icon d={ICONS.more} size={22} stroke={inMore || more ? 2.3 : 1.8} />
          <span className={`text-[11px] ${inMore || more ? "font-semibold" : "font-medium"}`}>More</span>
        </button>
      </nav>
    </div>
  );
}
