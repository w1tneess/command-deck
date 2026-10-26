import { useState } from "react";
import { inScope, type Scope } from "../server/logic.ts";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { activeOf } from "./model.ts";
import { AppleEmoji, ConfDots, PASS_SHORT, Pill, ScopeTag, SubjectIcon } from "./ui.tsx";

type FilterTab = "all" | "blindspots" | "pyqs" | "pb1" | "mastered";

export function RevisionMatrix({
  state,
  act,
  onOpenViva,
}: {
  state: State;
  act: Act;
  onOpenViva: (chapter: Chapter, subject: Subject) => void;
}) {
  const phase = activeOf(state);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [hoveredChapter, setHoveredChapter] = useState<{ chapter: Chapter; subject: Subject } | null>(null);

  // Criteria for filtering chapters
  const matchesFilter = (c: Chapter, s: Subject) => {
    const passesCount = c.passes.filter(Boolean).length;
    if (filter === "all") return true;
    if (filter === "blindspots") return passesCount === 0 || c.confidence <= 2 || !c.confirmed;
    if (filter === "pyqs") return c.passes[0] && !c.passes[1]; // concept done, PYQ pending
    if (filter === "pb1") return inScope(c.scope, "pb1") && passesCount < 3;
    if (filter === "mastered") return passesCount === 3 || c.confidence === 5;
    return true;
  };

  // Overall syllabus stats
  const totalChapters = state.subjects.reduce((acc, s) => acc + s.chapters.length, 0);
  const masteredChapters = state.subjects.reduce(
    (acc, s) => acc + s.chapters.filter((c) => c.passes.filter(Boolean).length === 3 || c.confidence === 5).length,
    0
  );
  const blindSpotChapters = state.subjects.reduce(
    (acc, s) => acc + s.chapters.filter((c) => c.passes.filter(Boolean).length === 0 && c.confidence <= 2).length,
    0
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Matrix Controls & Telemetry Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface/80 p-4 lg:p-5 backdrop-blur-md shadow-sm">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold   text-muted">
            <span className="inline-flex size-2 rounded-full bg-accent" />
            <span>Syllabus Radar</span>
            <span className="text-muted">/</span>
            <span className="text-muted">{totalChapters} Total Chapters</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-fg/80">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-accent" />
              <span>{masteredChapters} Mastered</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-danger" />
              <span className="text-danger font-semibold">{blindSpotChapters} Urgent Blind Spots</span>
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface/50 p-1" role="group" aria-label="Matrix filters">
          {[
            { id: "all", label: "All Chapters" },
            { id: "blindspots", label: "Blind Spots" },
            { id: "pyqs", label: "Needs PYQs" },
            { id: "pb1", label: "PB1 Priority" },
            { id: "mastered", label: "Mastered" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id as FilterTab)}
              className={`h-8 rounded-lg border px-3 text-xs font-medium transition-all tracking-wide ${
                filter === tab.id
                  ? "border-line-strong bg-fg text-bg font-semibold shadow-sm"
                  : "border-transparent bg-transparent text-muted hover:text-fg hover:bg-surface2"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Side-by-Side Subject Matrix Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {state.subjects.map((subject) => {
          const matching = subject.chapters.filter((c) => matchesFilter(c, subject));
          const examDate = subject.examDates[phase.id];

          return (
            <div
              key={subject.id}
              className="flex flex-col rounded-2xl border border-line bg-surface/80 p-4 lg:p-5 backdrop-blur-md shadow-sm"
            >
              {/* Subject Matrix Header */}
              <div className="flex items-center justify-between border-b border-line pb-3 mb-3.5">
                <div className="flex items-center gap-2.5">
                  <SubjectIcon id={subject.id} size={18} />
                  <div>
                    <h3 className="m-0 text-sm sm:text-base font-semibold text-fg tracking-tight">{subject.name}</h3>
                    <div className="font-mono text-xs text-muted mt-0.5">
                      {matching.length}/{subject.chapters.length} chapters · {subject.progressPct}% progress
                    </div>
                  </div>
                </div>
                {examDate && (
                  <span className="font-mono text-[11px] rounded-full border border-line bg-surface2 px-2.5 py-0.5 text-fg/80">
                    Exam: {examDate}
                  </span>
                )}
              </div>

              {/* Subject Chapters Heatmap List */}
              {matching.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-muted border border-dashed border-line rounded-xl">
                  No chapters matching current filter
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {matching.map((c, idx) => {
                    const passesCount = c.passes.filter(Boolean).length;
                    const isMastered = passesCount === 3 || c.confidence === 5;
                    const isBlindSpot = passesCount === 0 || c.confidence <= 2;

                    // Color theme for tile
                    const tileBorder = isMastered
                      ? "border-accent/30 hover:border-accent/30 bg-accent/[0.04]"
                      : isBlindSpot
                      ? "border-danger/30 hover:border-danger/30 bg-danger/[0.04]"
                      : "border-line hover:border-line-strong bg-surface2";

                    return (
                      <div
                        key={c.id}
                        onMouseEnter={() => setHoveredChapter({ chapter: c, subject })}
                        className={`group relative flex flex-col justify-between rounded-xl border ${tileBorder} p-3.5 transition-all hover:bg-surface2`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <span className="font-mono text-xs text-muted shrink-0 mt-0.5">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="text-[13px] font-medium text-fg leading-snug truncate">
                              {c.name}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-label={`Open Viva and Active Recall for ${c.name}`}
                            onClick={() => onOpenViva(c, subject)}
                            className="shrink-0 flex items-center gap-1 rounded-lg border border-warn/30 bg-warn/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-warn hover:bg-warn/15 transition-all  "
                          >
                            <AppleEmoji emoji="⚡" size={11} />
                            <span>Viva</span>
                          </button>
                        </div>

                        {/* Tile Footer: Passes & Confidence */}
                        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                          <div className="flex items-center gap-1">
                            {PASS_SHORT.map((short, pIdx) => {
                              const done = !!c.passes[pIdx];
                              return (
                                <button
                                  key={short}
                                  type="button"
                                  title={`Toggle ${short} pass`}
                                  onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${pIdx + 1}`, { done: !done })}
                                  className={`flex size-6 items-center justify-center rounded-md text-[11px] font-mono transition-all ${
                                    done
                                      ? "bg-accent text-bg font-bold"
                                      : "bg-surface border border-line text-muted hover:border-line-strong hover:text-fg"
                                  }`}
                                >
                                  {short}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2">
                            <ScopeTag scope={c.scope} />
                            <ConfDots value={c.confidence} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
