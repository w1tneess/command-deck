import { useId, useRef, useState } from "react";
import { SCOPES, inScope, type Scope } from "../server/logic.ts";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { activeOf, chaptersLabel } from "./model.ts";
import { setHashParams } from "./nav.ts";
import { RevisionMatrix } from "./RevisionMatrix.tsx";
import { Btn, Segmented, Card, ConfDots, GROUPS, H2, ICONS, Icon, PASS_HELP, PASS_NAMES, PASS_SHORT, ScopeTag, SubjectIcon, plural, PageHeader } from "./ui.tsx";
import { VivaDrawer } from "./VivaDrawer.tsx";

const SCOPE_LABEL: Record<Scope, string> = { unit1: "Unit 1", unit2: "Unit 2", pb1: "PB1", pb2: "PB2", board: "Boards" };
const SCOPE_FULL: Record<Scope, string> = { unit1: "Unit 1", unit2: "Unit 2", pb1: "Pre-Boards 1", pb2: "Pre-Boards 2", board: "Boards" };

/** The chips are cumulative (each level includes every earlier one), so say which levels the list covers. */
const scopeSummary = (level: Scope) =>
  level === "unit1" ? "Showing Unit 1 chapters only." : level === "board" ? "Showing every chapter, Unit 1 through Boards." : `Showing Unit 1 through ${SCOPE_FULL[level]}, cumulative.`;

/** Screen, subject and scope live in the URL hash (`#syllabus?view=matrix&subject=maths&scope=pb1`), so links, reloads and Back all land on the same view. */
export function Syllabus({ state, act, params }: { state: State; act: Act; params: URLSearchParams }) {
  const phase = activeOf(state);
  const viewMode: "tree" | "matrix" = params.get("view") === "matrix" ? "matrix" : "tree";
  const selected = params.get("subject") ?? "maths";
  const scopeParam = params.get("scope");
  const chosen = SCOPES.find((sc) => sc === scopeParam) ?? null;
  const setViewMode = (v: "tree" | "matrix") => setHashParams("syllabus", { view: v === "matrix" ? "matrix" : null });
  const setSelected = (id: string) => setHashParams("syllabus", { subject: id === "maths" ? null : id });
  const setChosen = (sc: Scope) => setHashParams("syllabus", { scope: sc === phase.scope ? null : sc });
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
      <PageHeader eyebrow="Class 10 CBSE" title="Syllabus" sub={viewMode === "tree" ? scopeSummary(level) : "Every chapter, by confidence and last revision."}>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented
            label="View"
            value={viewMode}
            onChange={setViewMode}
            options={[["tree", "Chapters"], ["matrix", "Revision grid"]]}
          />
          {viewMode === "tree" && (
            <Segmented label="Up to" value={level} onChange={setChosen} options={SCOPES.map((sc) => [sc, SCOPE_LABEL[sc]] as const)} />
          )}
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
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border-0 px-4 text-sm font-medium cursor-pointer ${
                  s.id === subject.id ? "bg-fg text-bg" : "bg-surface3 text-muted"
                }`}
              >
                <SubjectIcon id={s.id} size={14} />
                <span>{s.name}</span>
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-start gap-4 lg:gap-6">
            <nav aria-label="Subjects list" className="hidden max-w-[280px] min-w-0 flex-[1_1_240px] flex-col gap-1.5 lg:flex">
              {GROUPS.map((g) => {
                const members = g.ids.map((id) => state.subjects.find((s) => s.id === id)).filter((s): s is Subject => !!s);
                if (!members.length) return null;
                return (
                  <div key={g.label} className="flex flex-col gap-1">
                    {members.length > 1 && <div className="px-3 pt-3 pb-1 text-sm font-semibold text-muted">{g.label}</div>}
                    {members.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-current={s.id === subject.id ? "page" : undefined}
                        onClick={() => setSelected(s.id)}
                        className={`group flex items-start gap-3 rounded-xl border-0 px-3 py-2.5 text-left cursor-pointer ${s.id === subject.id ? "bg-surface3 text-fg" : "bg-transparent text-muted hover:bg-surface3 hover:text-fg"}`}
                      >
                        <SubjectIcon id={s.id} size={15} className="mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-fg">{members.length > 1 ? s.name : g.label}</span>
                          <span className="block text-sm text-muted">{chaptersLabel(s)}</span>
                          {s.chapters.length > 0 && (
                            <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface3">
                              <span className="block h-full rounded-full transition-all duration-300 ease-out bg-accent" style={{ width: `${s.progressPct}%` }} />
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
          <div>
            <Btn kind="outline" disabled={importingAll} onClick={handleImportAll} title="Import the official CBSE Class 10 chapters for every subject">
              {importingAll ? "Importing..." : "Import official CBSE chapters for all subjects"}
            </Btn>
          </div>
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
  const searchId = useId();
  const dismissKey = `unchecked-dismissed:${subject.id}`;
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(dismissKey) === "1"; } catch { return false; } });
  const unchecked = !dismissed && subject.chapters.length > 0 && subject.chapters.some((c) => !c.confirmed);
  const dismissUnchecked = () => { setDismissed(true); try { localStorage.setItem(dismissKey, "1"); } catch { /* optional */ } };
  const visible = subject.chapters
    .filter((c) => inScope(c.scope, level))
    .filter((c) => !query.trim() || c.name.toLowerCase().includes(query.toLowerCase().trim()));
  const ids = subject.chapters.map((c) => c.id);

  // Progress Telemetry
  const totalChapters = subject.chapters.length;
  const avgConfidence = totalChapters > 0
    ? (subject.chapters.reduce((sum, c) => sum + c.confidence, 0) / totalChapters).toFixed(1)
    : "—";
  const masteredCount = subject.chapters.filter((c) => c.status === "mastered").length;

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

  const passesDone = subject.chapters.reduce((n, c) => n + c.passes.filter(Boolean).length, 0);
  const passesTotal = totalChapters * 3;

  return (
    <Card labelledBy="subject-h" className="flex-[3_1_480px]">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <SubjectIcon id={subject.id} size={24} />
          <div>
            <H2 id="subject-h" big>{title}</H2>
            <div className="text-sm text-muted">{plural(subject.chapters.length, "chapter")}, {masteredCount} mastered</div>
          </div>
        </div>
        <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>
          {adding ? "Close" : "Add chapter"}
        </Btn>
      </div>

      {totalChapters > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-muted">{passesDone} of {passesTotal} revision passes done</span>
            <span className="text-muted">Average confidence {avgConfidence} of 5</span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface3">
            <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${passesTotal ? (passesDone / passesTotal) * 100 : 0}%` }} />
          </div>
          <p className="m-0 mt-2 text-xs text-muted">
            A revision pass is one full round on a chapter: Concept, then PYQs (past papers), then Sample papers. Mastered means all three are done.
            Confidence is how sure you feel, from 1 (shaky) to 5 (solid).
          </p>
        </div>
      )}

      <details className="mb-5">
        <summary className="cursor-pointer text-sm font-medium text-muted hover:text-fg">Subject settings</summary>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-3 text-sm text-muted">
            <span>Exam date for {phase.name}</span>
            <input
              type="date"
              value={subject.examDates[phase.id] ?? ""}
              onChange={(e) => act("PUT", `/api/subjects/${subject.id}/exam-date`, { phaseId: phase.id, date: e.target.value || null })}
              className="h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-fg"
            />
          </label>
          <Btn kind="outline" disabled={importingSub} onClick={handleImportSub} title={`Sync or import official CBSE chapters for ${subject.name}`}>
            {importingSub ? "Importing..." : "Sync official chapters"}
          </Btn>
        </div>
      </details>

      {unchecked && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface3 px-4 py-3 text-fg">
          <span className="text-sm">The {title} list has not been checked against the school PDF yet.</span>
          <div className="flex gap-2">
            <Btn onClick={() => act("PUT", `/api/subjects/${subject.id}/confirmed`, { confirmed: true })}>Mark checked</Btn>
            <Btn kind="ghost" onClick={dismissUnchecked}>Dismiss</Btn>
          </div>
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
        <div className="flex flex-col items-center gap-3 border-t border-line px-4 py-10 text-center">
          <SubjectIcon id={subject.id} size={28} />
          <div className="max-w-sm">
            <div className="text-base font-semibold text-fg">No chapters yet</div>
            <div className="mt-1 text-sm text-muted">Load the official CBSE Class 10 chapters for {title}, or add your own.</div>
          </div>
          <Btn kind="primary" disabled={importingSub} onClick={handleImportSub}>
            {importingSub ? "Importing..." : `Import ${subject.name} chapters`}
          </Btn>
        </div>
      )}

      {subject.chapters.length > 5 && (
        <div className="relative mb-2">
          <label htmlFor={`${searchId}-q`} className="sr-only">Search chapters</label>
          <input
            id={`${searchId}-q`}
            type="search"
            placeholder={`Search ${subject.chapters.length} chapters`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-full border border-line-strong bg-surface px-4 text-base text-fg placeholder:text-muted"
          />
        </div>
      )}
      {subject.chapters.length > 0 && visible.length === 0 && (
        <p className="m-0 border-t border-line py-5 text-sm text-muted">
          {query ? `No chapters match "${query}".` : "No chapters at this level. Show a later milestone above."}
        </p>
      )}

      <ol className="m-0 flex list-none flex-col gap-2 p-0 md:gap-3">
        {visible.map((c) => {
          if (editing === c.id) {
            return (
              <li key={c.id} className="rounded-2xl bg-surface2 px-3 [&>form]:border-t-0">
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
            <li key={c.id} data-chapter-id={c.id} className={`rounded-2xl bg-surface2 px-3 ${drag?.over === c.id && drag.id !== c.id ? "ring-1 ring-accent" : ""} ${drag?.id === c.id ? "opacity-50" : ""} transition-colors`}>
              <div className="grid grid-cols-[32px_minmax(0,1fr)] pointer-coarse:grid-cols-[44px_minmax(0,1fr)] items-center gap-x-2 gap-y-2 py-3 sm:grid-cols-[32px_minmax(0,1fr)_auto] pointer-coarse:sm:grid-cols-[44px_minmax(0,1fr)_auto]">
                <button
                  type="button"
                  aria-label={`Reorder ${c.name}. Drag, or use the up and down arrow keys.`}
                  onPointerDown={(e) => startDrag(c.id, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => nudge(c.id, e)}
                  className="flex size-8 pointer-coarse:size-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg border-0 bg-transparent text-muted hover:text-fg hover:bg-surface3"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8" /><circle cx="15" cy="6" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" /><circle cx="9" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></svg>
                </button>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-base font-medium text-fg">{c.name}</span>
                  <ScopeTag scope={c.scope} />
                </div>

                <div className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-3">
                  {PASS_NAMES.map((full, i) => (
                    <button
                      key={full}
                      type="button"
                      aria-pressed={!!c.passes[i]}
                      aria-label={`${PASS_SHORT[i]} pass for ${c.name}`}
                      data-tip={PASS_HELP[i]}
                      onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${i + 1}`, { done: !c.passes[i] })}
                      className={`min-h-[44px] rounded-full border-0 px-3 text-sm font-medium cursor-pointer md:min-h-9 ${c.passes[i] ? "bg-accent/15 text-accent" : "bg-surface3 text-muted hover:text-fg"}`}
                    >
                      {c.passes[i] ? "✓ " : ""}{PASS_SHORT[i]}
                    </button>
                  ))}
                  <ConfDots value={c.confidence} onChange={(n) => void act("PATCH", `/api/chapters/${c.id}`, { confidence: n })} />
                  <button
                    type="button"
                    aria-label={`Quiz me on ${c.name}`}
                    onClick={() => onOpenViva(c)}
                    className="min-h-[44px] rounded-full border border-line-strong bg-transparent px-3 text-sm font-medium text-fg hover:bg-surface3 cursor-pointer md:min-h-9"
                  >
                    Quiz
                  </button>
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c.id); setDeleting(null); }} className="flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-muted md:size-9 hover:text-fg hover:bg-surface3 cursor-pointer"><Icon d={ICONS.edit} size={16} /></button>
                  <span aria-hidden="true" className="mx-1 h-5 w-px bg-line-strong" />
                  <button type="button" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)} className="flex size-11 items-center justify-center rounded-full border-0 bg-transparent text-danger md:size-9 hover:bg-danger/10 cursor-pointer"><Icon d={ICONS.trash} size={16} /></button>
                </div>
              </div>
              {deleting === c.id && (
                <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-danger/10 px-4 py-3">
                  <span className="text-sm font-medium text-danger">Delete &ldquo;{c.name}&rdquo;? Its targets and revision records go too.</span>
                  <div className="flex gap-2">
                    <Btn kind="outline" onClick={() => setDeleting(null)}>Cancel</Btn>
                    <Btn className="border-0 bg-danger text-on-solid" onClick={async () => { if (await act("DELETE", `/api/chapters/${c.id}`)) setDeleting(null); }}>Delete</Btn>
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
    <form className="flex flex-wrap items-end gap-3.5 py-4 border-t border-line" onSubmit={submit}>
      <div className="flex flex-[1_1_240px] flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="font-mono text-xs   text-muted">Chapter name</label>
        <input id={`${id}-name`} autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-9 rounded-xl border border-line bg-surface px-3 font-mono text-xs text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none transition-colors" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-scope`} className="font-mono text-xs   text-muted">Scope</label>
        <select id={`${id}-scope`} value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value as Scope })} className="h-9 rounded-xl border border-line bg-surface px-3 font-mono text-xs text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none transition-colors">
          {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
        </select>
      </div>
      {editing && (
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-conf`} className="font-mono text-xs   text-muted">Confidence</span>
          <div role="group" aria-labelledby={`${id}-conf`} className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={v.confidence === n} aria-label={`Confidence ${n} of 5`} onClick={() => setV({ ...v, confidence: n })} className={`size-9 rounded-xl border font-mono text-[13px] font-semibold transition-all ${v.confidence === n ? "border-accent/30 bg-accent/15 text-accent" : "border-line bg-surface text-muted hover:border-line-strong"}`}>{n}</button>
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
    <details className="group rounded-2xl border border-line bg-surface/80 px-4 py-4 backdrop-blur-md lg:px-6 lg:py-5">
      <summary className="flex min-h-9 cursor-pointer items-center justify-between font-mono text-xs font-semibold   text-fg">
        <span>Exam Phases & Calendar Anchors</span>
        <span className="text-xs text-muted transition-transform group-open:rotate-180">▾</span>
      </summary>
      <p className="mt-1 mb-4 text-xs text-muted">Pre-Boards 1 dates locked from academic schedule. Secondary phases synchronize with school notifications.</p>
      <ul className="m-0 list-none p-0">
        {state.phases.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3.5">
            <strong className="text-xs   text-fg">{p.name}</strong>
            <span className="flex flex-wrap items-center gap-2.5">
              <input type="date" aria-label={`${p.name} starts`} value={p.startsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { startsOn: e.target.value })} className="h-8 rounded-xl border border-line bg-surface px-3 font-mono text-xs text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none transition-colors" />
              <span className="font-mono text-xs text-muted">to</span>
              <input type="date" aria-label={`${p.name} ends`} value={p.endsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { endsOn: e.target.value })} className="h-8 rounded-xl border border-line bg-surface px-3 font-mono text-xs text-fg focus-visible:ring-2 focus-visible:ring-focus focus:outline-none transition-colors" />
              <label className="flex min-h-[44px] md:min-h-[38px] items-center gap-2 text-[13px] font-medium text-fg/80">
                <input type="checkbox" checked={p.confirmed} onChange={(e) => act("PUT", `/api/phases/${p.id}`, { confirmed: e.target.checked })} className="size-6 rounded-md accent-accent focus-visible:ring-2 focus-visible:ring-focus" />
                Confirmed
              </label>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
