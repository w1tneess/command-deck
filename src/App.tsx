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
import { ICONS, Icon } from "./ui.tsx";
import { Week } from "./Week.tsx";

const NAV = [
  { id: "today", label: "Today", phone: "Today", icon: ICONS.today },
  { id: "syllabus", label: "Syllabus", phone: "Syllabus", icon: ICONS.syllabus },
  { id: "week", label: "Week", phone: "Week", icon: ICONS.week },
  { id: "deliverables", label: "Deliverables", phone: "Tasks", icon: ICONS.deliverables },
  { id: "backup", label: "Backup", phone: "Backup", icon: ICONS.backup },
] as const;
type Page = (typeof NAV)[number]["id"];

const pageFromHash = (): Page => NAV.find((n) => n.id === location.hash.slice(1))?.id ?? "today";

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await call<State>("GET", "/api/state"));
      setNeedsLogin(false);
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
    try {
      setError("");
      await call(method, url, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [load]);

  if (needsLogin) return <PinGate onDone={load} />;
  if (!state) return <main className="grid min-h-dvh place-items-center px-6 text-center text-muted">{error || "Loading…"}</main>;
  return <Shell state={state} act={act} reload={load} error={error} />;
}

function Shell({ state, act, reload, error }: { state: State; act: Act; reload: () => Promise<void>; error: string }) {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [theme, setTheme] = useTheme();
  const focus = useFocus(state, reload, act);

  useEffect(() => {
    const onHash = () => { setPage(pageFromHash()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="min-h-dvh lg:flex">
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
              <a key={n.id} href={`#${n.id}`} aria-current={page === n.id ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] ${page === n.id ? "bg-surface2 font-semibold text-fg" : "font-medium text-muted"}`}>
                <Icon d={n.icon} />
                <span>{n.label}</span>
              </a>
            ))}
          </nav>
        </div>
        <button type="button" onClick={() => signOut("/api/logout")} className="h-11 rounded-xl border border-line bg-transparent text-[14px] text-muted">Sign out</button>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col gap-4 px-4 pt-5 pb-44 lg:gap-6 lg:px-10 lg:pt-8 lg:pb-12">
        {error && <p role="alert" className="m-0 rounded-xl bg-accent px-4 py-3 text-[14px] font-medium text-ink">{error}</p>}
        {page === "today" && <Today state={state} act={act} focus={focus} />}
        {page === "syllabus" && <Syllabus state={state} act={act} />}
        {page === "week" && <Week state={state} act={act} />}
        {page === "deliverables" && <DeliverablesPage state={state} act={act} />}
        {page === "backup" && <Backup reload={reload} theme={theme} setTheme={setTheme} />}
      </main>

      <FocusBar focus={focus} state={state} onToday={page === "today"} />

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 flex h-[76px] border-t border-line bg-surface px-2 pt-1.5 pb-2.5 lg:hidden">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} aria-current={page === n.id ? "page" : undefined} className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-[3px] rounded-xl ${page === n.id ? "bg-surface2 text-fg" : "text-muted"}`}>
            <Icon d={n.icon} size={22} />
            <span className="text-xs font-medium">{n.phone}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
