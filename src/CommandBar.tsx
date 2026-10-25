import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Act, Chapter, State, Subject } from "./api.ts";
import type { FocusModel } from "./Focus.tsx";
import { AppleEmoji, ConfDots, ICONS, Icon, ScopeTag, SubjectBadge } from "./ui.tsx";

interface CommandItem {
  id: string;
  type: "chapter" | "action" | "navigation";
  title: string;
  subtitle?: string;
  badge?: string;
  chapter?: Chapter;
  subject?: Subject;
  onExecute: () => void | Promise<void>;
}

export function CommandBar({
  state,
  act,
  focus,
  onClose,
  onOpenViva,
  onOpenZen,
}: {
  state: State;
  act: Act;
  focus: FocusModel;
  onClose: () => void;
  onOpenViva?: (chapter: Chapter, subject: Subject) => void;
  onOpenZen?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const inputId = useId();

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  // Collect all 102 CBSE chapters across all 11 subjects
  const allChapters = useMemo(() => {
    return state.subjects.flatMap((s) =>
      s.chapters.map((c) => ({
        chapter: c,
        subject: s,
      }))
    );
  }, [state.subjects]);

  const items: CommandItem[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result: CommandItem[] = [];

    // 1. If query is typed, offer instant 1-keystroke Capture options
    if (q) {
      result.push({
        id: "quick-task",
        type: "action",
        title: `Add To-do: "${query.trim()}"`,
        subtitle: "Quick-add task to Inbox",
        badge: "To-do",
        onExecute: async () => {
          if (busy.current) return;
          busy.current = true;
          setSaving(true);
          try {
            await act("POST", "/api/captures", { text: query.trim(), kind: "todo" });
            onClose();
          } finally {
            busy.current = false;
            setSaving(false);
          }
        },
      });

      result.push({
        id: "quick-doubt",
        type: "action",
        title: `Capture Doubt / Note: "${query.trim()}"`,
        subtitle: "Save study doubt or reflection note",
        badge: "Doubt",
        onExecute: async () => {
          if (busy.current) return;
          busy.current = true;
          setSaving(true);
          try {
            await act("POST", "/api/captures", { text: query.trim(), kind: "note" });
            onClose();
          } finally {
            busy.current = false;
            setSaving(false);
          }
        },
      });

      result.push({
        id: "quick-target",
        type: "action",
        title: `Set as Today's Target: "${query.trim()}"`,
        subtitle: "Add directly to Today's Big 3 targets",
        badge: "Target",
        onExecute: async () => {
          if (busy.current) return;
          busy.current = true;
          setSaving(true);
          try {
            await act("POST", "/api/targets", { title: query.trim() });
            onClose();
          } finally {
            busy.current = false;
            setSaving(false);
          }
        },
      });
    }

    // 2. Search chapters across all subjects
    const matchedChapters = allChapters.filter(({ chapter, subject }) => {
      if (!q) return true;
      return (
        chapter.name.toLowerCase().includes(q) ||
        subject.name.toLowerCase().includes(q) ||
        subject.id.toLowerCase().includes(q)
      );
    });

    for (const { chapter, subject } of matchedChapters.slice(0, 10)) {
      result.push({
        id: `chap-${chapter.id}`,
        type: "chapter",
        title: chapter.name,
        subtitle: subject.name,
        chapter,
        subject,
        onExecute: () => {
          // Default action: start focus timer on this subject
          focus.setSubject(subject.id);
          location.hash = "#today";
          onClose();
        },
      });
    }

    // 3. System Navigation Shortcuts (shown if searching or on blank query)
    const navShortcuts = [
      { id: "nav-today", title: "Go to Today Dashboard", hash: "#today", icon: "Today" },
      { id: "nav-syllabus", title: "Go to Syllabus & Revision Matrix", hash: "#syllabus", icon: "Syllabus" },
      { id: "nav-habits", title: "Go to Daily Habits Tracker", hash: "#habits", icon: "Habits" },
      { id: "nav-week", title: "Go to 12-Week Heatmap", hash: "#week", icon: "Week" },
      { id: "nav-deliverables", title: "Go to School Deliverables", hash: "#deliverables", icon: "Tasks" },
      { id: "nav-projects", title: "Go to Personal Projects", hash: "#projects", icon: "Projects" },
    ];

    for (const nav of navShortcuts) {
      if (!q || nav.title.toLowerCase().includes(q) || nav.icon.toLowerCase().includes(q)) {
        result.push({
          id: nav.id,
          type: "navigation",
          title: nav.title,
          badge: "Jump",
          onExecute: () => {
            location.hash = nav.hash;
            onClose();
          },
        });
      }
    }

    // 4. Zen Studio Quick Toggle
    if (onOpenZen && (!q || "zen studio full screen".includes(q))) {
      result.push({
        id: "zen-studio",
        type: "action",
        title: "Open Zen Focus Studio",
        subtitle: "Minimalist distraction-free Pomodoro mode",
        badge: "Zen",
        onExecute: () => {
          onClose();
          onOpenZen();
        },
      });
    }

    return result;
  }, [query, allChapters, act, focus, onClose, onOpenZen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, items.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + items.length) % Math.max(1, items.length));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const current = items[selectedIndex];
      if (current) void current.onExecute();
    }
  };

  const handlePlanChapter = async (c: Chapter) => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await act("POST", "/api/targets", { chapterId: c.id });
      onClose();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const handleFocusChapter = (s: Subject) => {
    focus.setSubject(s.id);
    if (!focus.running) void focus.start();
    location.hash = "#today";
    onClose();
  };

  const handleVivaChapter = (c: Chapter, s: Subject) => {
    if (onOpenViva) onOpenViva(c, s);
    onClose();
  };

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Universal Command Bar"
        onKeyDown={handleKeyDown}
        className="fixed inset-x-4 top-[10vh] z-50 mx-auto flex max-h-[80vh] max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-bg shadow-2xl animate-fade-in"
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" size={18} className="text-muted shrink-0" />
          <label htmlFor={inputId} className="sr-only">Search chapters, tasks, or actions</label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={query}
            disabled={saving}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all 102 chapters, type to capture a task, or jump..."
            className="flex-1 bg-transparent text-sm text-fg placeholder:text-muted focus:outline-hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded p-1 text-xs text-muted hover:text-fg"
              aria-label="Clear query"
            >
              ✕
            </button>
          )}
          <kbd className="hidden sm:inline-block rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[11px] text-muted">
            Esc
          </kbd>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-12 text-center font-sans text-xs text-muted">
              No matching chapters or commands found for "{query}".
            </div>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0" role="listbox">
              {items.map((item, index) => {
                const isSelected = index === selectedIndex;
                const isChapter = item.type === "chapter" && item.chapter && item.subject;

                return (
                  <li
                    key={item.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(index)}
                    className={`group flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-surface3 text-fg"
                        : "text-fg/80 hover:bg-surface2"
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 min-w-0 flex-1"
                      onClick={() => void item.onExecute()}
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface2 text-muted group-hover:text-fg">
                        {item.type === "chapter" ? (
                          <Icon d={ICONS.syllabus} size={15} />
                        ) : item.type === "action" ? (
                          <Icon d={ICONS.flash} size={15} />
                        ) : (
                          <Icon d={ICONS.today} size={15} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="truncate text-xs font-medium text-fg">
                            {item.title}
                          </span>
                          {isChapter && (
                            <>
                              <SubjectBadge id={item.subject!.id} label={item.subject!.name} />
                              <ScopeTag scope={item.chapter!.scope} />
                            </>
                          )}
                          {item.badge && !isChapter && (
                            <span className="rounded px-1.5 py-0.2 font-mono text-[11px]   text-sky-400 border border-sky-500/20 bg-sky-500/10">
                              {item.badge}
                            </span>
                          )}
                        </div>
                        {item.subtitle && !isChapter && (
                          <div className="text-xs text-muted mt-0.5">{item.subtitle}</div>
                        )}
                        {isChapter && (
                          <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
                            <ConfDots value={item.chapter!.confidence} />
                            <span className="font-mono text-[11px]">
                              {item.chapter!.passes.filter(Boolean).length}/3 passes
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dedicated 1-Click Action Buttons for Chapters */}
                    {isChapter ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          title="Start focus session on this chapter"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFocusChapter(item.subject!);
                          }}
                          className="flex h-7 items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 font-sans text-xs font-medium text-sky-300 hover:bg-sky-500/20 transition-all active:scale-95"
                        >
                          <span>▶ Focus</span>
                        </button>
                        {onOpenViva && (
                          <button
                            type="button"
                            title="Launch active recall quiz"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleVivaChapter(item.chapter!, item.subject!);
                            }}
                            className="flex h-7 items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 font-sans text-xs font-medium text-cyan-300 hover:bg-cyan-500/20 transition-all active:scale-95"
                          >
                            <AppleEmoji emoji="⚡" size={11} />
                            <span>Viva</span>
                          </button>
                        )}
                        <button
                          type="button"
                          title="Add to today's targets"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handlePlanChapter(item.chapter!);
                          }}
                          className="flex h-7 items-center gap-1 rounded-md border border-line bg-surface2 px-2 font-sans text-xs font-medium text-fg hover:text-fg hover:bg-surface3 transition-all active:scale-95"
                        >
                          <span>+ Target</span>
                        </button>
                      </div>
                    ) : (
                      <kbd className="hidden sm:inline-block rounded px-1.5 py-0.5 font-mono text-[11px] text-muted group-hover:text-fg/80">
                        ↵
                      </kbd>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Command Bar Footer with helpful hints */}
        <div className="flex items-center justify-between border-t border-line bg-bg px-4 py-2 text-xs text-muted">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-line bg-surface2 px-1 py-0.2 font-mono text-[11px] text-muted">↑↓</kbd> navigate
            </span>
            <span>
              <kbd className="rounded border border-line bg-surface2 px-1 py-0.2 font-mono text-[11px] text-muted">↵</kbd> select
            </span>
            <span>
              <kbd className="rounded border border-line bg-surface2 px-1 py-0.2 font-mono text-[11px] text-muted">Esc</kbd> close
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted">
            {allChapters.length} Chapters Indexed
          </span>
        </div>
      </div>
    </>
  );
}
