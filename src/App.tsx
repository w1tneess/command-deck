import { useCallback, useEffect, useState } from "react";
import { AuthError, call, type Act, type State } from "./api.ts";
import { Backup } from "./Backup.tsx";
import { DeliverablesPage } from "./Deliverables.tsx";
import { FocusBar, useFocus } from "./Focus.tsx";
import { PinGate } from "./PinGate.tsx";
import { signOut } from "./session.ts";
import { Syllabus } from "./Syllabus.tsx";
import { useTheme } from "./theme.ts";
import { Today } from "./Today.tsx";
import { Card, ICONS, Icon } from "./ui.tsx";
import { Week } from "./Week.tsx";

/** `dock` marks the four tabs that sit in the phone's bottom bar; the rest live behind "More". */
const NAV = [
  { id: "today", label: "Today", phone: "Today", icon: ICONS.today, dock: true },
  { id: "syllabus", label: "Syllabus", phone: "Syllabus", icon: ICONS.syllabus, dock: true },
  { id: "habits", label: "Habits", phone: "Habits", icon: ICONS.habits, dock: true },
  { id: "week", label: "Week", phone: "Week", icon: ICONS.week, dock: false },
  { id: "deliverables", label: "Deliverables", phone: "Tasks", icon: ICONS.deliverables, dock: true },
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
  return <Shell state={state} act={act} reload={load} error={error} saving={saving > 0} />;
}

function Shell({ state, act, reload, error, saving }: { state: State; act: Act; reload: () => Promise<void>; error: string; saving: boolean }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useTheme();
  const focus = useFocus(state, reload, act);
  const [more, setMore] = useState(false);
  const inMore = NAV.some((n) => !n.dock && n.id === page);

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); setMore(false); window.scrollTo(0, 0); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("hashchange", onHash); window.removeEventListener("keydown", onKey); };
  }, []);

  return (
    <div className="min-h-dvh lg:flex" aria-busy={saving}>
      {saving && <div aria-hidden="true" className="fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-line"><div className="h-full w-1/3 animate-[slide_1s_ease-in-out_infinite] bg-accent" /></div>}
      <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col justify-between gap-6 border-r border-line bg-surface px-4 py-6 lg:flex">
        <div className="flex flex-col gap-7">
          <div className="flex items-center gap-3 px-2">
            <div className="flex size-8 items-center justify-center rounded-[9px] bg-accent text-ink"><Icon d="M9 11l3 3L22 4" size={18} stroke={2.4} /></div>
            <div>
              <div className="text-base font-semibold">Study</div>
              <div className="text-xs text-muted">Class X · 2026-27</div>
            </div>
          </div>
          <nav aria-label="Primary" className="flex flex-col gap-1">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} aria-current={page === n.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${page === n.id ? "bg-accent/15 font-semibold text-accent-text" : "font-medium text-muted"}`}>
                <Icon d={n.icon} />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <button type="button" onClick={() => signOut("/api/logout")} className="h-11 rounded-xl border border-line bg-transparent text-[14px] text-muted">Sign out</button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 pt-5 pb-44 lg:gap-6 lg:px-10 lg:pt-8 lg:pb-12">
        {error && <p role="alert" className="m-0 rounded-xl bg-warn px-4 py-3 text-[14px] font-medium text-warn-ink">{error}</p>}
        {page === "today" && <Today state={state} act={act} focus={focus} />}
        {page === "syllabus" && <Syllabus state={state} act={act} />}
        {page === "habits" && <ComingSoon title="Habits" />}
        {page === "week" && <Week state={state} act={act} />}
        {page === "deliverables" && <DeliverablesPage state={state} act={act} />}
        {page === "projects" && <ComingSoon title="Projects" />}
        {page === "backup" && <Backup reload={reload} theme={theme} setTheme={setTheme} />}
      </main>

      <FocusBar focus={focus} state={state} onToday={page === "today"} />

      {more && (
        <>
          <div aria-hidden="true" className="fixed inset-0 z-20 bg-bg/60 lg:hidden" onClick={() => setMore(false)} />
          <div id="more-menu" className="fixed inset-x-3 bottom-[84px] z-30 flex flex-col gap-1 rounded-2xl border border-line bg-surface p-2 shadow-lg lg:hidden">
            {NAV.filter((n) => !n.dock).map((n) => (
              <a key={n.id} href={`#${n.id}`} aria-current={page === n.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${page === n.id ? "bg-accent/15 font-semibold text-accent-text" : "font-medium text-fg"}`}>
                <Icon d={n.icon} />
                <span>{n.label}</span>
              </a>
            ))}
            <button type="button" onClick={() => signOut("/api/logout")} className="flex min-h-11 items-center rounded-xl border-0 bg-transparent px-3 text-left text-[15px] font-medium text-muted">Sign out</button>
          </div>
        </>
      )}

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex h-[76px] border-t border-line bg-surface px-2 pt-1.5 pb-2.5 lg:hidden">
        {NAV.filter((n) => n.dock).map((n) => (
          <a key={n.id} href={`#${n.id}`} aria-current={page === n.id ? "page" : undefined} className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-[3px] rounded-xl ${page === n.id ? "bg-accent/15 text-accent-text" : "text-muted"}`}>
            <Icon d={n.icon} size={22} />
            <span className="text-xs font-medium">{n.phone}</span>
          </a>
        ))}
        <button type="button" aria-expanded={more} aria-controls="more-menu" onClick={() => setMore((m) => !m)} className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-[3px] rounded-xl border-0 ${inMore || more ? "bg-accent/15 text-accent-text" : "bg-transparent text-muted"}`}>
          <Icon d={ICONS.more} size={22} />
          <span className="text-xs font-medium">More</span>
        </button>
      </nav>
    </div>
  );
}

/** Habits and Projects get their screens in the next milestone; the tabs exist now so the navigation is final. */
function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <header>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Class X · 2026-27</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">{title}</h1>
      </header>
      <Card><p className="m-0 text-[14px] text-muted">This screen arrives in the next update.</p></Card>
    </>
  );
}
