import { useCallback, useEffect, useState } from "react";
import { AuthError, call, type Act, type Chapter, type State, type Subject } from "./api.ts";
import { Backup } from "./Backup.tsx";
import { CaptureDrawer } from "./Capture.tsx";
import { CommandBar } from "./CommandBar.tsx";
import { DeliverablesPage } from "./Deliverables.tsx";
import { FocusBar, useFocus } from "./Focus.tsx";
import { Habits } from "./Habits.tsx";
import { Overview } from "./Overview.tsx";
import { SignIn } from "./SignIn.tsx";
import { Projects } from "./Projects.tsx";
import { signOut } from "./session.ts";
import { Syllabus } from "./Syllabus.tsx";
import { useTheme } from "./theme.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { GROUPS, groupOf, type Page } from "./nav.ts";
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
const ALL_PAGES: Page[] = [...GROUPS.flatMap((g) => g.pages.map((p) => p.id as Page)), "backup"];
const pageFromHash = (): Page => ALL_PAGES.find((id) => id === location.hash.slice(1)) ?? "today";

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

  if (needsLogin) return <SignIn />;
  if (!state) return <main className="grid min-h-dvh place-items-center px-6 text-center text-muted bg-bg text-muted">{error || "Loading…"}</main>;
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
  const group = groupOf(page);

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
        if (e.key === "3") location.hash = "#schedule";
        if (e.key === "4") location.hash = "#habits";
      }
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, [focus.running, focus.start, focus.stop]);

  return (
    <div
      className="bg-bg min-h-screen font-sans text-fg flex flex-col lg:flex-row relative"
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
      />

      {/* Main View Area */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="text-sm font-medium text-muted">{istDateTime}</div>
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <button
              type="button"
              aria-expanded={more}
              aria-controls="account-menu"
              aria-label="Menu"
              onClick={() => setMore((m) => !m)}
              className="flex size-9 items-center justify-center rounded-full bg-fg text-sm font-semibold text-bg cursor-pointer"
            >
              A
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-[1180px] flex-1 p-4 sm:p-6 lg:p-8 flex flex-col gap-6 pb-24 lg:pb-8">
          {group && group.pages.length > 1 && (
            <nav aria-label={group.label} className="-mb-2 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface3 p-1">
              {group.pages.map((p) => (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  aria-current={page === p.id ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium ${page === p.id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"}`}
                >
                  {p.label}
                </a>
              ))}
            </nav>
          )}
          {error && (
            <div role="alert" className="m-0 flex items-center justify-between gap-3 rounded-2xl border border-danger/30 bg-danger/10 text-danger px-4.5 py-3 text-xs sm:text-sm shadow-xs">
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
            <div role="status" className="m-0 flex items-center gap-2.5 rounded-2xl border border-warn/30 bg-warn/15 text-warn px-4.5 py-3 text-xs sm:text-sm shadow-xs">
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
          {page === "overview" && <Overview state={state} />}
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

      {/* Phone: quick add, lifted above the timer while a round is running */}
      {page !== "backup" && (
        <button
          type="button"
          aria-label="Quick add"
          onClick={() => setCommandBar(true)}
          className={`fixed right-4 z-20 ${focus.running ? "bottom-[150px]" : "bottom-[84px]"} flex size-11 items-center justify-center rounded-full bg-fg text-bg shadow-lg hover:scale-105 transition-all active:scale-95 lg:hidden`}
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
          <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40 animate-fade-in" onClick={() => setMore(false)} />
          <div id="account-menu" className="fixed right-3 top-14 z-40 flex w-64 flex-col gap-0.5 rounded-2xl border border-line bg-surface p-2 shadow-xl animate-fade-in">
            {([
              ["Settings & backup", () => { location.hash = "#backup"; }],
              ["Calendar sync", () => setCalendarModal(true)],
              ["Zen focus", () => setZenMode(true)],
              ["Quick add", () => setCommandBar(true)],
            ] as const).map(([label, run]) => (
              <button
                key={label}
                type="button"
                onClick={() => { setMore(false); run(); }}
                className="flex min-h-11 items-center rounded-xl border-0 bg-transparent px-3.5 text-left text-sm font-medium text-fg hover:bg-surface2 cursor-pointer"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => signOut("/api/logout")}
              className="flex min-h-11 items-center rounded-xl border-0 bg-transparent px-3.5 text-left text-sm font-medium text-danger hover:bg-surface2 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </>
      )}

      {/* Phone: four places to go */}
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex h-[68px] items-center border-t border-line bg-bg/95 px-2 backdrop-blur-xl lg:hidden">
        {GROUPS.map((g) => {
          const active = group?.id === g.id;
          return (
            <a
              key={g.id}
              href={`#${g.pages[0].id}`}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 flex-1 flex-col items-center justify-center gap-1 ${active ? "text-fg font-semibold" : "text-muted"}`}
            >
              <span className={`flex h-7 w-14 items-center justify-center rounded-full ${active ? "bg-surface3" : ""}`}>
                <Icon d={g.icon} size={20} stroke={active ? 2.2 : 1.7} />
              </span>
              <span className="text-xs">{g.label}</span>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
