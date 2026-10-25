import type { State } from "./api.ts";
import { ICONS, Icon } from "./ui.tsx";

export interface SidebarProps {
  page: string;
  state: State;
  onOpenCapture: () => void;
  onOpenCommandBar: () => void;
  onOpenZen: () => void;
}

export function Sidebar({ page, state, onOpenCapture }: SidebarProps) {
  const navItems = [
    { id: "today", label: "Home", href: "#today", icon: ICONS.home },
    { id: "syllabus", label: "Study", href: "#syllabus", icon: ICONS.syllabus },
    { id: "habits", label: "Habits", href: "#habits", icon: ICONS.habits },
    { id: "projects", label: "Projects", href: "#projects", icon: ICONS.projects },
    { id: "deliverables", label: "Deliverables", href: "#deliverables", icon: ICONS.deliverables },
    { id: "schedule", label: "Schedule", href: "#schedule", icon: ICONS.clock },
    { id: "capture", label: "Capture", href: "#capture", onClick: onOpenCapture, icon: ICONS.plus },
    { id: "routine", label: "Routine", href: "#routine", icon: ICONS.target },
    { id: "week", label: "Reviews", href: "#week", icon: ICONS.week },
  ];

  // Benchmark breakdown for Class 10 CBSE subjects with live pass settlement
  const SUBJECTS_CONFIG = [
    { id: "physics", name: "Physics", color: "#52b788" },
    { id: "chemistry", name: "Chemistry", color: "#74c69d" },
    { id: "biology", name: "Biology", color: "#95d5b2" },
    { id: "maths", name: "Maths", color: "#e9c46a" },
    { id: "sst", name: "SST", color: "#f4a261" },
    { id: "english", name: "English", color: "#a2d2ff" },
    { id: "bengali", name: "Bengali", color: "#b8c0ff" },
    { id: "it", name: "IT", color: "#c8b6ff" },
  ];

  const getSubjectPassPct = (cfgId: string) => {
    let chapters = [];
    if (cfgId === "sst") {
      const sstSubs = state.subjects.filter((s) => ["history", "civics", "geography", "economics", "sst"].includes(s.id));
      chapters = sstSubs.flatMap((s) => s.chapters);
    } else {
      const liveSubject = state.subjects.find((s) => s.id === cfgId || s.name.toLowerCase().includes(cfgId));
      chapters = liveSubject?.chapters ?? [];
    }
    if (chapters.length === 0) return 0;
    const passesDone = chapters.reduce((sum, ch) => sum + ch.passes.filter(Boolean).length, 0);
    return Math.round((passesDone / (chapters.length * 3)) * 100);
  };

  const subjectsOverview = SUBJECTS_CONFIG.map((cfg) => ({
    ...cfg,
    pct: getSubjectPassPct(cfg.id),
  }));

  const allChapters = state.subjects.flatMap((s) => s.chapters);
  const totalPassesDone = allChapters.reduce((sum, ch) => sum + ch.passes.filter(Boolean).length, 0);
  const totalProgress = allChapters.length > 0 ? Math.round((totalPassesDone / (allChapters.length * 3)) * 100) : 0;

  return (
    <aside
      className="hidden lg:flex w-64 shrink-0 flex-col justify-between bg-bg border-r border-white/[0.06] p-5 select-none text-zinc-100 min-h-screen"
      aria-label="Main Navigation Rail"
    >
      <div>
        {/* Brand Header */}
        <a href="#today" className="block group">
          <h1 className="font-serif text-2xl font-normal text-white tracking-tight">Life OS</h1>
          <p className="text-[11px] text-zinc-400 font-sans tracking-widest uppercase mt-0.5">
            Study · Build · Be
          </p>
        </a>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-1 mt-6" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive =
              page === item.id || (item.id === "today" && (page === "" || page === "today"));

            if (item.onClick) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.onClick}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-xs font-medium tracking-wide text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer text-left w-full"
                >
                  <Icon d={item.icon} size={17} stroke={1.75} />
                  <span>{item.label}</span>
                </button>
              );
            }

            return (
              <a
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-xs font-medium tracking-wide transition-all ${
                  isActive
                    ? "bg-white/[0.08] text-white font-semibold shadow-2xs"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                <Icon d={item.icon} size={17} stroke={isActive ? 2.2 : 1.75} />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>

        {/* Class 10 · CBSE Syllabus Overview Widget */}
        <div className="mt-8 pt-6 border-t border-white/[0.06] flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-zinc-300">Class 10 · CBSE</span>
            <span className="font-mono text-xs font-semibold text-zinc-400 tabular-nums">
              {totalProgress}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-hover transition-all duration-500"
              style={{ width: `${totalProgress}%` }}
            />
          </div>

          {/* Subject Breakdown List */}
          <div className="flex flex-col gap-2 mt-2">
            {subjectsOverview.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-zinc-300 text-xs">{s.name}</span>
                </div>
                <span className="font-mono text-xs text-zinc-400 tabular-nums">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Settings: theme, backup & restore, Google connection */}
      <a
        href="#backup"
        className={`mt-8 flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-xs font-medium tracking-wide transition-all ${
          page === "backup" ? "bg-white/[0.08] text-white font-semibold" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
        }`}
      >
        <Icon d={ICONS.backup} size={17} stroke={page === "backup" ? 2.2 : 1.75} />
        <span>Settings</span>
      </a>
    </aside>
  );
}
