import type { State } from "./api.ts";
import { GROUPS, type Page } from "./nav.ts";
import { ICONS, Icon } from "./ui.tsx";

export interface SidebarProps {
  page: Page;
  state: State;
  onOpenCapture: () => void;
}

/** Desktop rail: four places, a quick add, and one line of overall progress. */
export function Sidebar({ page, state, onOpenCapture }: SidebarProps) {
  const allChapters = state.subjects.flatMap((s) => s.chapters);
  const passesDone = allChapters.reduce((sum, ch) => sum + ch.passes.filter(Boolean).length, 0);
  const progress = allChapters.length > 0 ? Math.round((passesDone / (allChapters.length * 3)) * 100) : 0;
  const link = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${active ? "bg-surface3 text-fg font-semibold" : "text-muted hover:bg-surface3 hover:text-fg"}`;

  return (
    <aside className="hidden min-h-screen w-60 shrink-0 select-none flex-col justify-between border-r border-line bg-bg p-5 lg:flex" aria-label="Main navigation">
      <div>
        <a href="#today" className="block">
          <h1 className="m-0 font-serif text-2xl font-bold tracking-tight text-fg">Command Deck</h1>
        </a>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {GROUPS.map((g) => {
            const active = g.pages.some((p) => p.id === page);
            return (
              <a key={g.id} href={`#${g.pages[0].id}`} aria-current={active ? "page" : undefined} className={link(active)}>
                <Icon d={g.icon} size={18} stroke={active ? 2.2 : 1.75} />
                <span>{g.label}</span>
              </a>
            );
          })}
          <button type="button" onClick={onOpenCapture} className={`${link(false)} w-full cursor-pointer border-0 bg-transparent text-left`}>
            <Icon d={ICONS.plus} size={18} stroke={1.75} />
            <span>Quick add</span>
          </button>
        </nav>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-muted">Syllabus covered</span>
            <span className="font-semibold text-fg">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface3">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <a href="#backup" className={link(page === "backup")}>
          <Icon d={ICONS.backup} size={18} stroke={page === "backup" ? 2.2 : 1.75} />
          <span>Settings</span>
        </a>
      </div>
    </aside>
  );
}
