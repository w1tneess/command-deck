import { useId, useRef, useState } from "react";
import { SCOPES, inScope, type Scope } from "../server/logic.ts";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { activeOf, chaptersLabel, startedCount } from "./model.ts";
import { RevisionMatrix } from "./RevisionMatrix.tsx";
import { AppleEmoji, Btn, Card, ConfDots, GROUPS, H2, ICONS, Icon, PASS_NAMES, PASS_SHORT, Pill, ScopeTag, SubjectBadge, SubjectIcon, plural, PageHeader } from "./ui.tsx";
import { VivaDrawer } from "./VivaDrawer.tsx";

const SCOPE_LABEL: Record<Scope, string> = { unit1: "Unit 1", unit2: "Unit 2", pb1: "PB1", pb2: "PB2", board: "Boards" };

export function Syllabus({ state, act }: { state: State; act: Act }) {
  const phase = activeOf(state);
  const [viewMode, setViewMode] = useState<"tree" | "matrix">("tree");
  const [selected, setSelected] = useState("maths");
  const [chosen, setChosen] = useState<Scope | null>(null);
  const [viva, setViva] = useState<{ chapter: Chapter; subject: Subject } | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const busyAll = useRef(false);

  const level = chosen ?? phase.scope; // follows the active phase until you pick a level
  const subject = state.subjects.find((s) => s.id === selected) ?? state.subjects[0];
  const label = (s: Subject) => GROUPS.find((g) => g.ids.length === 1 && g.ids[0] === s.id)?.label ?? s.name;

  const handleImportAll = async () => {
    if (busyAll.current) return;
    busyAll.current = true;
    setImportingAll(true);
    try {
      await act("POST", "/api/syllabus/import-official", { subjectId: "all" });
    } finally {
      busyAll.current = false;
      setImportingAll(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Class 10 CBSE" title="Syllabus">

        {/* View Switcher & Scope Level Selector */}
        <div className="flex flex-col gap-2.5 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex rounded-xl border border-white/[0.08] bg-surface/90 p-1 backdrop-blur-md">
              <button
                type="button"
                aria-pressed={viewMode === "tree"}
                onClick={() => setViewMode("tree")}
                className={`flex items-center gap-1.5 h-8 rounded-lg px-3.5 text-xs font-semibold tracking-wide transition-all ${
                  viewMode === "tree"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Icon d={ICONS.syllabus} size={13} stroke={2} />
                <span>Detailed Breakdown</span>
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "matrix"}
                onClick={() => setViewMode("matrix")}
                className={`flex items-center gap-1.5 h-8 rounded-lg px-3.5 text-xs font-semibold tracking-wide transition-all ${
                  viewMode === "matrix"
                    ? "bg-white text-zinc-950 shadow-sm"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Icon d={ICONS.flash} size={13} stroke={2} />
                <span>Compact Matrix View</span>
              </button>
            </div>

            {/* Import Official CBSE Button */}
            <button
              type="button"
              disabled={importingAll}
              onClick={handleImportAll}
              title="Import official CBSE Class 10 curriculum and NCERT rationalised chapters for all subjects"
              className="flex items-center gap-1.5 h-8 rounded-xl border border-white/[0.08] bg-surface/90 px-3 text-xs font-medium tracking-wide text-zinc-300 hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
            >
              <Icon d={ICONS.syllabus} size={13} stroke={2} />
              <span>{importingAll ? "Importing..." : "Import Official CBSE"}</span>
            </button>

            {/* Scope Filter Buttons */}
            {viewMode === "tree" && (
              <div className="flex flex-wrap gap-1 rounded-xl border border-white/[0.08] bg-surface/50 p-1" role="group" aria-label="Show chapters up to">
                {SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={level === s}
                    onClick={() => setChosen(s)}
                    className={`h-8 rounded-lg border px-3 text-xs font-medium tracking-wide transition-all ${
                      level === s
                        ? "border-white/20 bg-white text-zinc-950 font-semibold shadow-sm"
                        : "border-transparent bg-transparent text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                    }`}
                  >
                    {SCOPE_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="font-mono text-xs text-muted">A phase covers its own scope level and all previous milestones.</div>
        </div>
      </PageHeader>

      {/* Revision Matrix View vs Detailed Subject Tree View */}
      {viewMode === "matrix" ? (
        <RevisionMatrix
          state={state}
          act={act}
          onOpenViva={(c, s) => setViva({ chapter: c, subject: s })}
        />
      ) : (
        <>
          {/* Phone: a scrolling row of subjects. Wide screens get the list in the design. */}
          <nav aria-label="Subjects" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {state.subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                aria-current={s.id === subject.id ? "page" : undefined}
                onClick={() => setSelected(s.id)}
                className={`inline-flex items-center gap-2 h-9 shrink-0 rounded-xl border px-3 text-xs font-medium tracking-wide transition-all ${
                  s.id === subject.id
                    ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300 shadow-sm"
                    : "border-white/[0.08] bg-surface/80 text-zinc-400 hover:border-white/20"
                }`}
              >
                <SubjectIcon id={s.id} size={14} />
                <span>{s.name}</span>
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-start gap-4 lg:gap-6">
            <nav aria-label="Subjects list" className="hidden max-w-[280px] min-w-0 flex-[1_1_240px] flex-col gap-1.5 rounded-2xl border border-white/[0.08] bg-surface/80 p-3.5 backdrop-blur-md lg:flex">
              {GROUPS.map((g) => {
                const members = g.ids.map((id) => state.subjects.find((s) => s.id === id)).filter((s): s is Subject => !!s);
                if (!members.length) return null;
                return (
                  <div key={g.label} className="flex flex-col gap-1">
                    {members.length > 1 && <div className="px-3 pt-2.5 pb-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-muted">{g.label}</div>}
                    {members.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-current={s.id === subject.id ? "page" : undefined}
                        onClick={() => setSelected(s.id)}
                        className={`group flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all ${s.id === subject.id ? "border-emerald-500/30 bg-emerald-500/10 text-white shadow-sm" : "border-transparent bg-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"}`}
                      >
                        <SubjectIcon id={s.id} size={15} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold tracking-wide text-zinc-200 group-hover:text-white">{members.length > 1 ? s.name : g.label}</span>
                          <span className="block font-mono text-xs text-muted">{chaptersLabel(s)}</span>
                          {s.chapters.length > 0 && (
                            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                              <span className="block h-full rounded-full transition-all duration-300 ease-out bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${s.progressPct}%` }} />
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })}
            </nav>

            <SubjectCard
              key={subject.id}
              subject={subject}
              title={label(subject)}
              state={state}
              level={level}
              act={act}
              onOpenViva={(c) => setViva({ chapter: c, subject })}
            />
          </div>

          <PhaseDates state={state} act={act} />
        </>
      )}

      {/* Quick Viva & Active Recall Drawer */}
      {viva && (
        <VivaDrawer
          chapter={viva.chapter}
          subject={viva.subject}
          act={act}
          onClose={() => setViva(null)}
        />
      )}
    </>
  );
}

function SubjectCard({
  subject,
  title,
  state,
  level,
  act,
  onOpenViva,
}: {
  subject: Subject;
  title: string;
  state: State;
  level: Scope;
  act: Act;
  onOpenViva: (c: Chapter) => void;
}) {
  const phase = activeOf(state);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; over: string | null } | null>(null);
  const dragRef = useRef<{ id: string; over: string | null } | null>(null);
  const [importingSub, setImportingSub] = useState(false);
  const busySub = useRef(false);
  const [query, setQuery] = useState("");
  const unchecked = subject.chapters.length > 0 && subject.chapters.some((c) => !c.confirmed);
  const visible = subject.chapters
    .filter((c) => inScope(c.scope, level))
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.toLowerCase().trim()));
  const ids = subject.chapters.map((c) => c.id);

  // Progress Telemetry
  const totalChapters = subject.chapters.length;
  const verifiedCount = subject.chapters.filter((c) => c.confirmed).length;
  const avgConfidence = totalChapters > 0
    ? (subject.chapters.reduce((sum, c) => sum + c.confidence, 0) / totalChapters).toFixed(1)
    : "—";
  const pyqCount = subject.chapters.filter((c) => !!c.passes[1]).length;
  const masteredCount = subject.chapters.filter((c) => c.passes.every(Boolean) || c.confidence === 5).length;

  const handleImportSub = async () => {
    if (busySub.current) return;
    busySub.current = true;
    setImportingSub(true);
    try {
      await act("POST", "/api/syllabus/import-official", { subjectId: subject.id });
    } finally {
      busySub.current = false;
      setImportingSub(false);
    }
  };

  const reorder = (from: string, to: string) => {
    if (from === to) return;
    const next = ids.filter((id) => id !== from);
    next.splice(ids.indexOf(to), 0, from);
    void act("POST", `/api/subjects/${subject.id}/reorder`, { order: next });
  };
  const startDrag = (id: string, e: React.PointerEvent) => {
    e.preventDefault();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* pointer capture fallback */ }
    dragRef.current = { id, over: null };
    setDrag(dragRef.current);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-chapter-id]");
    dragRef.current = { ...dragRef.current, over: row?.dataset.chapterId ?? null };
    setDrag(dragRef.current);
  };
  const endDrag = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d?.over) reorder(d.id, d.over);
  };
  const nudge = (id: string, e: React.KeyboardEvent) => {
    const i = ids.indexOf(id);
    const target = e.key === "ArrowUp" ? ids[i - 1] : e.key === "ArrowDown" ? ids[i + 1] : undefined;
    if (target) { e.preventDefault(); reorder(id, target); }
  };

  return (
    <Card labelledBy="subject-h" className="flex-[3_1_480px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SubjectIcon id={subject.id} size={22} />
          <div>
            <H2 id="subject-h" big>{title}</H2>
            <div className="font-mono text-xs text-muted">{plural(subject.chapters.length, "chapter")} · {startedCount(subject)} started</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Btn
            kind="outline"
            disabled={importingSub}
            onClick={handleImportSub}
            title={`Sync or import official CBSE chapters for ${subject.name}`}
            className="text-xs h-9 px-3"
          >
            {importingSub ? "Importing..." : "Sync Official"}
          </Btn>
          <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)} className="h-9 px-3.5">
            {adding ? "Close" : "Add Chapter"}
          </Btn>
        </div>
      </div>

      <label className="mb-4 flex flex-wrap items-center gap-3 font-mono text-xs text-zinc-400">
        <span>EXAM DATE [{phase.name.toUpperCase()}]:</span>
        <input
          type="date"
          value={subject.examDates[phase.id] ?? ""}
          onChange={(e) => act("PUT", `/api/subjects/${subject.id}/exam-date`, { phaseId: phase.id, date: e.target.value || null })}
          className="h-8 rounded-xl border border-white/10 bg-surface px-3 font-mono text-xs text-white focus:border-emerald-500/50 focus:outline-none transition-colors"
        />
      </label>

      {/* Progress Telemetry Banner */}
      {totalChapters > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-surface/60 p-2.5 backdrop-blur-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">CBSE Verified</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-white tabular-nums">{verifiedCount}</span>
              <span className="font-mono text-xs text-muted">/ {totalChapters}</span>
              {verifiedCount === totalChapters && (
                <span className="ml-auto inline-flex items-center text-[11px] text-emerald-400 font-medium">✓ 100%</span>
              )}
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${(verifiedCount / totalChapters) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-surface/60 p-2.5 backdrop-blur-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Avg Confidence</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-sky-400 tabular-nums">{avgConfidence}</span>
              <span className="font-mono text-xs text-muted">/ 5.0</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-sky-400 transition-all duration-300"
                style={{ width: `${(Number(avgConfidence) / 5) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-surface/60 p-2.5 backdrop-blur-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">PYQ Pass</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-teal-400 tabular-nums">{pyqCount}</span>
              <span className="font-mono text-xs text-muted">/ {totalChapters}</span>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">{Math.round((pyqCount / totalChapters) * 100)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-teal-400 transition-all duration-300"
                style={{ width: `${(pyqCount / totalChapters) * 100}%` }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1 rounded-xl border border-white/[0.08] bg-surface/60 p-2.5 backdrop-blur-sm">
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Full Mastery</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-bold text-emerald-400 tabular-nums">{masteredCount}</span>
              <span className="font-mono text-xs text-muted">/ {totalChapters}</span>
              <span className="ml-auto font-mono text-[11px] text-zinc-400">{Math.round((masteredCount / totalChapters) * 100)}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                style={{ width: `${(masteredCount / totalChapters) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {unchecked && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-300">
          <span className="text-xs">The {title} list has not been checked against the school PDF yet.</span>
          <Btn kind="secondary" className="bg-surface/80 border-amber-500/40 text-amber-200" onClick={() => act("PUT", `/api/subjects/${subject.id}/confirmed`, { confirmed: true })}>Mark Checked</Btn>
        </div>
      )}

      {adding && (
        <ChapterForm
          subject={subject}
          initial={{ name: "", scope: level === "board" ? "board" : level, confidence: 1 }}
          saveLabel="Add chapter"
          onCancel={() => setAdding(false)}
          onSave={async (v) => {
            if (await act("POST", "/api/chapters", { subjectId: subject.id, name: v.name, scope: v.scope })) setAdding(false);
          }}
        />
      )}

      {subject.chapters.length === 0 && !adding && (
        <div className="border-t border-white/[0.08] py-8 px-4 text-center flex flex-col items-center justify-center gap-3">
          <div className="size-11 rounded-2xl bg-surface/90 border border-white/[0.08] flex items-center justify-center text-zinc-400 shadow-sm">
            <SubjectIcon id={subject.id} size={22} />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <span className="text-sm font-semibold text-zinc-200">No chapters configured yet</span>
            <span className="text-xs text-zinc-400">
              Load the official CBSE Class 10 rationalised NCERT syllabus for {title} directly with official scopes & verified citations.
            </span>
          </div>
          <Btn
            kind="primary"
            disabled={importingSub}
            onClick={handleImportSub}
            className="mt-1"
          >
            {importingSub ? "Importing..." : `Import Official ${subject.name} Chapters`}
          </Btn>
        </div>
      )}
      {/* Chapter Search Bar for catalog density */}
      {subject.chapters.length > 5 && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              placeholder={`Search ${subject.chapters.length} chapters...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded-xl border border-white/[0.08] bg-surface/70 px-3 pl-8 font-mono text-xs text-white placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none transition-colors"
            />
            <span className="pointer-events-none absolute left-2.5 top-2">
              <AppleEmoji emoji="🔍" size={13} />
            </span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1.5 text-xs text-zinc-500 hover:text-white"
                aria-label="Clear chapter search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}
      {subject.chapters.length > 0 && visible.length === 0 && (
        <p className="m-0 border-t border-white/[0.08] py-5 font-mono text-xs text-muted">
          {query ? `No chapters match "${query}".` : "No chapters at this scope level. Increase scope threshold above."}
        </p>
      )}

      <ol className="m-0 list-none p-0">
        {visible.map((c) => {
          const number = String(ids.indexOf(c.id) + 1).padStart(2, "0");
          if (editing === c.id) {
            return (
              <li key={c.id} className="border-t border-white/[0.08]">
                <ChapterForm
                  subject={subject}
                  initial={{ name: c.name, scope: c.scope, confidence: c.confidence }}
                  saveLabel="Save"
                  onCancel={() => setEditing(null)}
                  onSave={async (v) => {
                    if (!(await act("PATCH", `/api/chapters/${c.id}/meta`, { name: v.name, scope: v.scope }))) return;
                    if (v.confidence !== c.confidence && !(await act("PATCH", `/api/chapters/${c.id}`, { confidence: v.confidence }))) return;
                    setEditing(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li key={c.id} data-chapter-id={c.id} className={`border-t ${drag?.over === c.id && drag.id !== c.id ? "border-emerald-500" : "border-white/[0.06]"} ${drag?.id === c.id ? "opacity-50" : ""} transition-colors`}>
              <div className="flex flex-wrap items-center gap-2.5 py-2.5">
                <button
                  type="button"
                  aria-label={`Reorder ${c.name}. Drag, or use the up and down arrow keys.`}
                  onPointerDown={(e) => startDrag(c.id, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => nudge(c.id, e)}
                  className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border-0 bg-transparent text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-all"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8" /><circle cx="15" cy="6" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" /><circle cx="9" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></svg>
                </button>
                <span className="w-6 font-mono text-xs tabular-nums text-muted">{number}</span>
                <div className="flex min-w-0 flex-[1_1_200px] flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-zinc-100">{c.name}</span>
                  <ScopeTag scope={c.scope} />
                </div>

                <button
                  type="button"
                  aria-label={`Open Quick Viva / Active Recall for ${c.name}`}
                  onClick={() => onOpenViva(c)}
                  className="h-7 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 font-mono text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-all uppercase tracking-wider flex items-center gap-1"
                >
                  <AppleEmoji emoji="⚡" size={11} />
                  <span>Viva</span>
                </button>

                <div className="flex items-center gap-1">
                  {PASS_NAMES.map((full, i) => (
                    <button
                      key={full}
                      type="button"
                      aria-pressed={!!c.passes[i]}
                      aria-label={`${PASS_SHORT[i]} pass for ${c.name}`}
                      onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${i + 1}`, { done: !c.passes[i] })}
                      className="h-8 border-0 bg-transparent px-0.5"
                    >
                      <span className={`block rounded-lg border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-all ${c.passes[i] ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.15)]" : "border-white/[0.08] bg-surface text-zinc-400 hover:border-white/20 hover:text-zinc-200"}`}>{c.passes[i] ? "✓ " : ""}{PASS_SHORT[i]}</span>
                    </button>
                  ))}
                </div>
                <span className="flex w-16 justify-center"><ConfDots value={c.confidence} /></span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c.id); setDeleting(null); }} className="flex size-8 items-center justify-center rounded-lg border-0 bg-transparent text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"><Icon d={ICONS.edit} size={15} /></button>
                  <button type="button" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)} className="flex size-8 items-center justify-center rounded-lg border-0 bg-transparent text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"><Icon d={ICONS.trash} size={15} /></button>
                </div>
              </div>
              {deleting === c.id && (
                <div role="alert" className="mx-0 mt-2 mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3 lg:ml-11">
                  <span className="text-xs text-rose-300 font-medium">Delete &ldquo;{c.name}&rdquo;? Targets and revision records will be purged.</span>
                  <div className="flex gap-2">
                    <Btn kind="outline" className="px-3" onClick={() => setDeleting(null)}>Cancel</Btn>
                    <Btn className="border border-rose-500/50 bg-rose-600 px-3 font-mono text-xs font-semibold text-on-solid hover:bg-rose-500" onClick={async () => { if (await act("DELETE", `/api/chapters/${c.id}`)) setDeleting(null); }}>Delete</Btn>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

type ChapterValues = { name: string; scope: Scope; confidence: number };

/** Add and edit share one form, as in the design: name and scope, plus confidence when editing. */
function ChapterForm({ initial, saveLabel, onSave, onCancel }: { subject: Subject; initial: ChapterValues; saveLabel: string; onSave: (v: ChapterValues) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const id = useId();
  const editing = saveLabel === "Save";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = v.name.trim();
    if (!name || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await onSave({ ...v, name });
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-wrap items-end gap-3.5 py-4 border-t border-white/[0.08]" onSubmit={submit}>
      <div className="flex flex-[1_1_240px] flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="font-mono text-xs uppercase tracking-wider text-muted">Chapter name</label>
        <input id={`${id}-name`} autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-9 rounded-xl border border-white/10 bg-surface px-3 font-mono text-xs text-white focus:border-emerald-500/50 focus:outline-none transition-colors" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-scope`} className="font-mono text-xs uppercase tracking-wider text-muted">Scope</label>
        <select id={`${id}-scope`} value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value as Scope })} className="h-9 rounded-xl border border-white/10 bg-surface px-3 font-mono text-xs text-white focus:border-emerald-500/50 focus:outline-none transition-colors">
          {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
        </select>
      </div>
      {editing && (
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-conf`} className="font-mono text-xs uppercase tracking-wider text-muted">Confidence</span>
          <div role="group" aria-labelledby={`${id}-conf`} className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={v.confidence === n} aria-label={`Confidence ${n} of 5`} onClick={() => setV({ ...v, confidence: n })} className={`size-9 rounded-xl border font-mono text-xs font-semibold transition-all ${v.confidence === n ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-white/10 bg-surface text-zinc-400 hover:border-white/25"}`}>{n}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Btn type="submit" kind="primary" disabled={saving} className="px-4">{saving ? "Saving…" : saveLabel}</Btn>
        <Btn kind="outline" className="px-4" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

/** Where the four phases' dates are edited. Only Pre-Boards 1 is confirmed; the rest are placeholders. */
function PhaseDates({ state, act }: { state: State; act: Act }) {
  return (
    <details className="group rounded-2xl border border-white/[0.08] bg-surface/80 px-4 py-4 backdrop-blur-md lg:px-6 lg:py-5">
      <summary className="flex min-h-9 cursor-pointer items-center justify-between font-mono text-xs font-semibold uppercase tracking-wider text-zinc-200">
        <span>Exam Phases & Calendar Anchors</span>
        <span className="text-xs text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <p className="mt-1 mb-4 text-xs text-muted">Pre-Boards 1 dates locked from academic schedule. Secondary phases synchronize with school notifications.</p>
      <ul className="m-0 list-none p-0">
        {state.phases.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] py-3.5">
            <strong className="text-xs uppercase tracking-wider text-zinc-200">{p.name}</strong>
            <span className="flex flex-wrap items-center gap-2.5">
              <input type="date" aria-label={`${p.name} starts`} value={p.startsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { startsOn: e.target.value })} className="h-8 rounded-xl border border-white/10 bg-surface px-3 font-mono text-xs text-white focus:border-emerald-500/50 focus:outline-none transition-colors" />
              <span className="font-mono text-xs text-muted">to</span>
              <input type="date" aria-label={`${p.name} ends`} value={p.endsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { endsOn: e.target.value })} className="h-8 rounded-xl border border-white/10 bg-surface px-3 font-mono text-xs text-white focus:border-emerald-500/50 focus:outline-none transition-colors" />
              <label className="flex min-h-8 items-center gap-2 text-xs font-medium text-zinc-300">
                <input type="checkbox" checked={p.confirmed} onChange={(e) => act("PUT", `/api/phases/${p.id}`, { confirmed: e.target.checked })} className="size-4 rounded-md accent-emerald-500" />
                Confirmed
              </label>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
