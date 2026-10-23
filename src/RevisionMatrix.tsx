import { useState } from "react";
import { inScope, type Scope } from "../server/logic.ts";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { activeOf } from "./model.ts";
import { ConfDots, PASS_SHORT, Pill } from "./ui.tsx";

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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0e1117] p-4 lg:p-5 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-accent-text">
            <span>Syllabus Blind Spot Radar</span>
            <span className="text-white/20">/</span>
            <span className="text-white/50">{totalChapters} Total Chapters</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-white/70">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-good shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span>{masteredChapters} Mastered</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
              <span className="text-red-400 font-semibold">{blindSpotChapters} Urgent Blind Spots</span>
            </span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Matrix filters">
          {[
            { id: "all", label: "All Chapters" },
            { id: "blindspots", label: "⚠️ Blind Spots" },
            { id: "pyqs", label: "📝 Needs PYQs" },
            { id: "pb1", label: "🎯 PB1 Priority" },
            { id: "mastered", label: "✓ Mastered" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              onClick={() => setFilter(tab.id as FilterTab)}
              className={`h-9 rounded-xl border px-3 font-mono text-xs font-medium transition-all active:scale-95 ${
                filter === tab.id
                  ? "border-accent bg-accent text-white font-semibold shadow-[0_0_12px_rgba(99,102,241,0.4)]"
                  : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
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
              className="flex flex-col rounded-[22px] border border-white/10 bg-[#090b10] p-4 lg:p-5 shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              {/* Subject Matrix Header */}
              <div className="flex items-baseline justify-between border-b border-white/[0.08] pb-3 mb-3">
                <div>
                  <h3 className="m-0 text-base font-semibold text-white tracking-tight">{subject.name}</h3>
                  <div className="font-mono text-xs text-white/50 mt-0.5">
                    {matching.length} of {subject.chapters.length} chapters · {subject.progressPct}% progress
                  </div>
                </div>
                {examDate && (
                  <span className="font-mono text-[11px] rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-white/70">
                    Exam: {examDate}
                  </span>
                )}
              </div>

              {/* Subject Chapters Heatmap List */}
              {matching.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-white/40 border border-dashed border-white/10 rounded-xl">
                  No chapters match this filter
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {matching.map((c, idx) => {
                    const passesCount = c.passes.filter(Boolean).length;
                    const isMastered = passesCount === 3 || c.confidence === 5;
                    const isBlindSpot = passesCount === 0 || c.confidence <= 2;

                    // Color theme for tile
                    const tileBorder = isMastered
                      ? "border-good/30 hover:border-good/60 bg-good/[0.03]"
                      : isBlindSpot
                      ? "border-red-500/30 hover:border-red-500/60 bg-red-500/[0.04]"
                      : "border-accent/20 hover:border-accent/50 bg-white/[0.02]";

                    return (
                      <div
                        key={c.id}
                        onMouseEnter={() => setHoveredChapter({ chapter: c, subject })}
                        className={`group relative flex flex-col justify-between rounded-xl border ${tileBorder} p-3 transition-all duration-150 hover:bg-white/[0.05]`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2 min-w-0">
                            <span className="font-mono text-[11px] text-white/40 shrink-0 mt-0.5">
                              {String(idx + 1).padStart(2, "0")}
                            </span>
                            <span className="text-[13.5px] font-medium text-white leading-snug truncate">
                              {c.name}
                            </span>
                          </div>

                          <button
                            type="button"
                            aria-label={`Open Viva and Active Recall for ${c.name}`}
                            onClick={() => onOpenViva(c, subject)}
                            className="shrink-0 flex items-center gap-1 rounded-lg border border-accent/40 bg-accent/20 px-2 py-0.5 font-mono text-[10px] font-bold text-accent-text hover:bg-accent/30 transition-all active:scale-95"
                          >
                            ⚡ VIVA
                          </button>
                        </div>

                        {/* Tile Footer: Passes & Confidence */}
                        <div className="mt-2.5 flex items-center justify-between border-t border-white/[0.05] pt-2">
                          <div className="flex items-center gap-1">
                            {PASS_SHORT.map((short, pIdx) => {
                              const done = !!c.passes[pIdx];
                              return (
                                <button
                                  key={short}
                                  type="button"
                                  title={`Toggle ${short} pass`}
                                  onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${pIdx + 1}`, { done: !done })}
                                  className={`flex size-5 items-center justify-center rounded text-[10px] font-mono transition-all active:scale-90 ${
                                    done
                                      ? "bg-good text-black font-bold shadow-[0_0_6px_rgba(52,211,153,0.6)]"
                                      : "bg-white/10 text-white/50 hover:bg-white/20"
                                  }`}
                                >
                                  {short}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-white/40 uppercase">
                              {c.scope}
                            </span>
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
