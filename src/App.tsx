import { useCallback, useEffect, useState } from "react";
import { AuthError, call, type Act, type Chapter, type State, type Subject } from "./api.ts";
import { Backup } from "./Backup.tsx";
import { CaptureDrawer } from "./Capture.tsx";
import { CommandBar } from "./CommandBar.tsx";
import { DeliverablesPage } from "./Deliverables.tsx";
import { FocusBar, useFocus } from "./Focus.tsx";
import { Habits } from "./Habits.tsx";
import { PinGate } from "./PinGate.tsx";
import { Projects } from "./Projects.tsx";
import { signOut } from "./session.ts";
import { Syllabus } from "./Syllabus.tsx";
import { useTheme } from "./theme.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { Routine } from "./Routine.tsx";
import { Schedule } from "./Schedule.tsx";
import { CalendarModal } from "./CalendarModal.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Today } from "./Today.tsx";
import { AppleEmoji, BrandLogo, ICONS, Icon } from "./ui.tsx";
import { VivaDrawer } from "./VivaDrawer.tsx";
import { Week } from "./Week.tsx";
import { ZenFocusStudio } from "./ZenFocus.tsx";

/** `dock` marks the five tabs that sit in the phone's bottom bar; the rest live behind "More". */
const NAV = [
  { id: "today", label: "Home", phone: "Home", icon: ICONS.home, dock: true, key: "1" },
  { id: "syllabus", label: "Study", phone: "Study", icon: ICONS.syllabus, dock: true, key: "2" },
  { id: "habits", label: "Habits", phone: "Habits", icon: ICONS.habits, dock: true, key: "3" },
  { id: "projects", label: "Projects", phone: "Projects", icon: ICONS.projects, dock: true, key: "4" },
  { id: "deliverables", label: "Deliverables", phone: "Tasks", icon: ICONS.deliverables, dock: true, key: "5" },
  { id: "schedule", label: "Schedule", phone: "Schedule", icon: ICONS.clock, dock: false },
  { id: "routine", label: "Routine", phone: "Routine", icon: ICONS.target, dock: false },
  { id: "week", label: "Reviews", phone: "Reviews", icon: ICONS.week, dock: false },
  { id: "backup", label: "Settings", phone: "Settings", icon: ICONS.backup, dock: false },
] as const;
type Page = (typeof NAV)[number]["id"];

const pageFromHash = (): Page => NAV.find((n) => n.id === location.hash.slice(1))?.id ?? "today";

function formatISTHeaderDate(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).formatToParts(now);
  const m = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${m.weekday}, ${m.day} ${m.month} ${m.year}   ${m.hour}:${m.minute} ${m.dayPeriod?.toUpperCase()} (IST)`;
}

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("error"));
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
  if (!state) return <main className="grid min-h-dvh place-items-center px-6 text-center text-muted bg-bg text-zinc-400">{error || "Loading…"}</main>;
  return <Shell state={state} act={act} reload={load} error={error} setError={setError} saving={saving > 0} online={online} />;
}

function Shell({ state, act, reload, error, setError, saving, online }: { state: State; act: Act; reload: () => Promise<void>; error: string; setError: (e: string) => void; saving: boolean; online: boolean }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useTheme();
  const focus = useFocus(state, reload, act);
  const [more, setMore] = useState(false);
  const [capture, setCapture] = useState(false);
  const [commandBar, setCommandBar] = useState(false);
  const [viva, setViva] = useState<{ chapter: Chapter; subject: Subject } | null>(null);
  const [zenMode, setZenMode] = useState(false);
  const [calendarModal, setCalendarModal] = useState(false);
  const inMore = NAV.some((n) => !n.dock && n.id === page);

  const [istDateTime, setIstDateTime] = useState(() => formatISTHeaderDate());
  useEffect(() => {
    const timer = setInterval(() => setIstDateTime(formatISTHeaderDate()), 10_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); setMore(false); window.scrollTo(0, 0); };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable);

      if (e.key === "Escape") {
        setMore(false);
        setZenMode(false);
        setCommandBar(false);
        setCapture(false);
        setCalendarModal(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandBar((c) => !c);
      }

      // Desktop command center shortcuts (active outside input fields)
      if (!inInput) {
        if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          setCapture((c) => !c);
        }
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
        if (e.key === "4") location.hash = "#projects";
        if (e.key === "5") location.hash = "#deliverables";
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, [focus.running, focus.start, focus.stop]);

  return (
    <div
      className="bg-bg min-h-screen font-sans text-zinc-100 flex flex-col lg:flex-row relative"
      aria-busy={saving}
    >
      {saving && (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-[3px] overflow-hidden bg-black/20">
          <div className="h-full w-1/3 animate-[slide_1s_cubic-bezier(0.16,1,0.3,1)_infinite] bg-accent shadow-[0_0_8px_rgba(82,183,136,0.8)]" />
        </div>
      )}

      {/* Left Navigation Rail (Desktop) */}
      <Sidebar
        page={page}
        state={state}
        onOpenCapture={() => setCapture(true)}
        onOpenCommandBar={() => setCommandBar(true)}
        onOpenZen={() => setZenMode(true)}
      />

      {/* Main View Area */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        {/* Top Header Bar */}
        <header className="flex items-center justify-between px-6 lg:px-8 py-4 border-b border-white/[0.04] bg-bg/90 sticky top-0 z-20 backdrop-blur-md">
          {/* Dynamic IST Timestamp */}
          <div className="font-sans text-xs text-zinc-400 tracking-wide font-medium">
            {istDateTime}
          </div>

          {/* Right Slogan, Calendar Sync & Avatar */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setCalendarModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 text-xs font-sans text-sky-300 font-medium transition-all cursor-pointer shadow-xs"
              title="Google Calendar & iCal Feed Sync"
            >
              <AppleEmoji emoji="📅" size={13} />
              <span className="hidden sm:inline">Sync Calendar</span>
            </button>

            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button
              type="button"
              onClick={() => signOut("/api/logout")}
              title="Advaita Chandra · Click to Sign Out"
              aria-label="Student Profile — Click to Sign Out"
              className="flex size-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-200 font-sans font-bold text-xs border border-white/10 hover:border-white/30 transition-all cursor-pointer shadow-xs"
            >
              A
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-[1180px] flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 pb-24 lg:pb-8">
          {error && (
            <div role="alert" className="m-0 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/20 text-rose-200 px-4.5 py-3 text-xs sm:text-sm shadow-xs">
              <div className="flex items-center gap-2.5">
                <span className="size-2 rounded-full bg-rose-500" />
                <span>{error}</span>
              </div>
              <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded-lg p-1 transition-opacity hover:opacity-75 cursor-pointer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
          )}
          {!online && (
            <div role="status" className="m-0 flex items-center gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-950/20 text-amber-200 px-4.5 py-3 text-xs sm:text-sm shadow-xs">
              <span className="size-2 rounded-full bg-amber-500" />
              <span>Offline mode: Changes will synchronize when network connection is re-established.</span>
            </div>
          )}
          {page === "today" && (
            <Today
              state={state}
              act={act}
              focus={focus}
              onOpenZen={() => setZenMode(true)}
              onOpenViva={(c, s) => setViva({ chapter: c, subject: s })}
              onOpenCommandBar={() => setCommandBar(true)}
            />
          )}
          {page === "syllabus" && <Syllabus state={state} act={act} />}
          {page === "habits" && <Habits state={state} act={act} />}
          {page === "week" && <Week state={state} act={act} />}
          {page === "deliverables" && (
            <DeliverablesPage
              state={state}
              act={act}
              onOpenViva={(c, s) => setViva({ chapter: c, subject: s })}
            />
          )}
          {page === "schedule" && (
            <Schedule
              state={state}
              act={act}
              onStartFocus={() => focus.start()}
            />
          )}
          {page === "projects" && <Projects state={state} act={act} />}
          {page === "routine" && <Routine state={state} act={act} />}
          {page === "backup" && <Backup reload={reload} theme={theme} setTheme={setTheme} />}
        </main>
      </div>

      <FocusBar
        focus={focus}
        state={state}
        onToday={page === "today"}
        onOpenZen={() => setZenMode(true)}
        onOpenCapture={() => setCommandBar(true)}
      />

      {/* Phone: floating capture button on secondary tabs when FocusBar is not active */}
      {!(page === "today" || focus.running) && (
        <button
          type="button"
          aria-label="Quick add"
          onClick={() => setCommandBar(true)}
          className="fixed right-4 bottom-[78px] z-20 flex size-11 items-center justify-center rounded-full bg-accent text-accent-text shadow-lg hover:scale-105 transition-all active:scale-95 lg:hidden"
        >
          <Icon d={ICONS.plus} size={20} stroke={2.2} />
        </button>
      )}
      {capture && <CaptureDrawer state={state} act={act} onClose={() => setCapture(false)} />}

      {/* Universal Command Bar Quick Launcher */}
      {commandBar && (
        <CommandBar
          state={state}
          act={act}
          focus={focus}
          onClose={() => setCommandBar(false)}
          onOpenViva={(c, s) => {
            setCommandBar(false);
            setViva({ chapter: c, subject: s });
          }}
          onOpenZen={() => {
            setCommandBar(false);
            setZenMode(true);
          }}
        />
      )}

      {/* Global Viva Active Recall Drawer */}
      {viva && (
        <VivaDrawer
          chapter={viva.chapter}
          subject={viva.subject}
          act={act}
          onClose={() => setViva(null)}
        />
      )}

      {/* Fullscreen Zen Focus Studio */}
      {zenMode && (
        <ZenFocusStudio focus={focus} state={state} onClose={() => setZenMode(false)} act={act} />
      )}

      {/* Google Calendar & iCal Subscription Modal */}
      {calendarModal && (
        <CalendarModal
          state={state}
          act={act}
          onClose={() => setCalendarModal(false)}
        />
      )}

      {more && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs lg:hidden animate-fade-in" onClick={() => setMore(false)} />
          <div id="more-menu" className="fixed inset-x-3 bottom-[76px] z-40 flex flex-col gap-1 rounded-2xl border border-white/[0.08] bg-surface/95 backdrop-blur-xl p-2.5 shadow-2xl lg:hidden animate-drawer-mobile">
            {NAV.filter((n) => !n.dock).map((n) => {
              const active = page === n.id;
              return (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-xs font-medium tracking-wide transition-all ${
                    active
                      ? "bg-white/[0.1] text-white font-semibold shadow-xs"
                      : "text-zinc-400 hover:bg-white/[0.04] hover:text-white"
                  }`}
                >
                  <Icon d={n.icon} size={18} stroke={active ? 2.2 : 1.7} />
                  <span>{n.label}</span>
                  {active && <span className="ml-auto size-1.5 rounded-full bg-accent shadow-xs" />}
                </a>
              );
            })}
            <button
              type="button"
              onClick={() => {
                setMore(false);
                setZenMode(true);
              }}
              className="flex min-h-11 items-center gap-3 rounded-xl border-0 bg-transparent px-3.5 text-left text-xs font-medium text-zinc-300 hover:bg-white/[0.04] hover:text-white transition-all cursor-pointer"
            >
              <Icon d={ICONS.zen} size={18} />
              <span>Zen Studio</span>
            </button>
            <button
              type="button"
              onClick={() => signOut("/api/logout")}
              className="flex min-h-11 items-center rounded-xl border-0 bg-transparent px-3.5 text-left text-xs font-medium text-rose-400 hover:bg-white/[0.04] hover:text-rose-300 transition-all cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </>
      )}

      {/* Sticky Mobile Bottom Navigation Dock */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 flex h-[66px] items-center border-t border-white/[0.08] bg-bg/95 backdrop-blur-2xl px-2 shadow-[0_-8px_30px_rgba(0,0,0,0.6)] lg:hidden"
      >
        {NAV.filter((n) => n.dock).map((n) => {
          const active = page === n.id;
          return (
            <a
              key={n.id}
              href={`#${n.id}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-full transition-all ${
                active ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-200"
              }`}
            >
              <Icon d={n.icon} size={19} stroke={active ? 2.3 : 1.7} />
              <span className="text-[11px] font-medium tracking-wide">{n.phone}</span>
              {active && (
                <span className="absolute bottom-1 size-1 rounded-full bg-accent shadow-xs" />
              )}
            </a>
          );
        })}
        <button
          type="button"
          aria-expanded={more}
          aria-controls="more-menu"
          onClick={() => setMore((m) => !m)}
          className={`relative flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-full border-0 bg-transparent transition-all ${
            inMore || more ? "text-white font-bold" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          <Icon d={ICONS.more} size={19} stroke={inMore || more ? 2.3 : 1.7} />
          <span className="text-[11px] font-medium tracking-wide">More</span>
          {(inMore || more) && (
            <span className="absolute bottom-1 size-1 rounded-full bg-accent shadow-xs" />
          )}
        </button>
      </nav>
    </div>
  );
}
