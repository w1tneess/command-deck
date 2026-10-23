import { useId, useRef, useState } from "react";
import { SCOPES, inScope, type Scope } from "../server/logic.ts";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { activeOf, chaptersLabel, startedCount } from "./model.ts";
import { RevisionMatrix } from "./RevisionMatrix.tsx";
import { Btn, Card, ConfDots, GROUPS, H2, ICONS, Icon, PASS_NAMES, PASS_SHORT, Pill, plural } from "./ui.tsx";
import { VivaDrawer } from "./VivaDrawer.tsx";

const SCOPE_LABEL: Record<Scope, string> = { unit1: "Unit 1", unit2: "Unit 2", pb1: "PB1", pb2: "PB2", board: "Boards" };

export function Syllabus({ state, act }: { state: State; act: Act }) {
  const phase = activeOf(state);
  const [viewMode, setViewMode] = useState<"tree" | "matrix">("tree");
  const [selected, setSelected] = useState("maths");
  const [chosen, setChosen] = useState<Scope | null>(null);
  const [viva, setViva] = useState<{ chapter: Chapter; subject: Subject } | null>(null);

  const level = chosen ?? phase.scope; // follows the active phase until you pick a level
  const subject = state.subjects.find((s) => s.id === selected) ?? state.subjects[0];
  const label = (s: Subject) => GROUPS.find((g) => g.ids.length === 1 && g.ids[0] === s.id)?.label ?? s.name;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line/60 pb-5">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className="inline-flex size-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_var(--accent)]" />
            <span className="uppercase tracking-widest">CLASS 10 · 2026-27</span>
            <span className="text-line-strong">/</span>
            <span className="text-accent-text font-semibold">ACADEMIC ENGINE</span>
          </div>
          <h1 className="m-0 mt-1 text-[32px] sm:text-[36px] font-bold tracking-tight text-fg">
            Syllabus Architecture
          </h1>
        </div>

        {/* View Switcher & Scope Level Selector */}
        <div className="flex flex-col gap-2 lg:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex rounded-xl border border-line/80 bg-surface2/60 p-1">
              <button
                type="button"
                aria-pressed={viewMode === "tree"}
                onClick={() => setViewMode("tree")}
                className={`h-9 rounded-lg px-3.5 font-mono text-xs font-semibold uppercase tracking-wider transition-all ${
                  viewMode === "tree"
                    ? "bg-accent text-white shadow-[0_2px_8px_rgba(99,102,241,0.4)]"
                    : "text-muted hover:text-fg"
                }`}
              >
                Tree View
              </button>
              <button
                type="button"
                aria-pressed={viewMode === "matrix"}
                onClick={() => setViewMode("matrix")}
                className={`flex items-center gap-1.5 h-9 rounded-lg px-3.5 font-mono text-xs font-semibold uppercase tracking-wider transition-all ${
                  viewMode === "matrix"
                    ? "bg-accent text-white shadow-[0_2px_8px_rgba(99,102,241,0.4)]"
                    : "text-muted hover:text-fg"
                }`}
              >
                <span>⚡</span>
                <span>Revision Matrix</span>
              </button>
            </div>

            {/* Scope Filter Buttons */}
            {viewMode === "tree" && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Show chapters up to">
                {SCOPES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={level === s}
                    onClick={() => setChosen(s)}
                    className={`h-9 rounded-xl border px-3 font-mono text-xs font-medium transition-all ${
                      level === s ? "border-accent bg-accent text-white font-semibold" : "border-line bg-surface text-fg hover:border-line-strong"
                    }`}
                  >
                    {SCOPE_LABEL[s]}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-muted">A phase covers its own level and everything below it.</div>
        </div>
      </header>

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
                className={`h-11 shrink-0 rounded-full border px-4 text-[14px] ${
                  s.id === subject.id
                    ? "border-accent bg-accent font-semibold text-white"
                    : "border-line bg-surface text-fg"
                }`}
              >
                {s.name}
              </button>
            ))}
          </nav>

          <div className="flex flex-wrap items-start gap-4 lg:gap-6">
            <nav aria-label="Subjects list" className="hidden max-w-[300px] min-w-0 flex-[1_1_240px] flex-col gap-1 rounded-2xl border border-line bg-surface p-3 lg:flex">
              {GROUPS.map((g) => {
                const members = g.ids.map((id) => state.subjects.find((s) => s.id === id)).filter((s): s is Subject => !!s);
                if (!members.length) return null;
                return (
                  <div key={g.label} className="flex flex-col gap-1">
                    {members.length > 1 && <div className="px-3.5 pt-3 pb-1 text-xs uppercase tracking-[0.06em] text-muted">{g.label}</div>}
                    {members.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        aria-current={s.id === subject.id ? "page" : undefined}
                        onClick={() => setSelected(s.id)}
                        className={`flex flex-col gap-0.5 rounded-xl border-0 px-3.5 py-3 text-left text-fg ${s.id === subject.id ? "bg-surface2" : "bg-transparent"}`}
                      >
                        <span className="text-[15px] font-medium">{members.length > 1 ? s.name : g.label}</span>
                        <span className="text-[13px] text-muted">{chaptersLabel(s)}</span>
                        {s.chapters.length > 0 && (
                          <span className="mt-1 block h-1.5 overflow-hidden rounded-[3px] bg-line">
                            <span className="block h-full transition-all duration-300 ease-out bg-gradient-to-r from-accent to-accent-text" style={{ width: `${s.progressPct}%` }} />
                          </span>
                        )}
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
  const unchecked = subject.chapters.length > 0 && subject.chapters.some((c) => !c.confirmed);
  const visible = subject.chapters.filter((c) => inScope(c.scope, level));
  const ids = subject.chapters.map((c) => c.id);

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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-3">
          <H2 id="subject-h" big>{title}</H2>
          <span className="text-[13px] text-muted">{plural(subject.chapters.length, "chapter")} · {startedCount(subject)} started</span>
        </div>
        <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add chapter"}</Btn>
      </div>

      <label className="mb-3 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        Exam date for {phase.name}
        <input
          type="date"
          value={subject.examDates[phase.id] ?? ""}
          onChange={(e) => act("PUT", `/api/subjects/${subject.id}/exam-date`, { phaseId: phase.id, date: e.target.value || null })}
          className="h-11 rounded-xl border border-line bg-bg px-3 text-[14px] text-fg"
        />
      </label>

      {unchecked && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
          <span className="text-[14px]">The {title} list has not been checked against the school PDF yet.</span>
          <Btn kind="secondary" className="bg-surface" onClick={() => act("PUT", `/api/subjects/${subject.id}/confirmed`, { confirmed: true })}>Mark as checked</Btn>
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

      {subject.chapters.length === 0 && !adding && <p className="m-0 border-t border-line py-4 text-[14px] text-muted">No chapters yet. Add them from the school syllabus.</p>}
      {subject.chapters.length > 0 && visible.length === 0 && <p className="m-0 border-t border-line py-4 text-[14px] text-muted">No chapters at this level. Pick a higher level above.</p>}

      <ol className="m-0 list-none p-0">
        {visible.map((c) => {
          const number = String(ids.indexOf(c.id) + 1).padStart(2, "0");
          if (editing === c.id) {
            return (
              <li key={c.id} className="border-t border-line">
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
            <li key={c.id} data-chapter-id={c.id} className={`border-t ${drag?.over === c.id && drag.id !== c.id ? "border-accent" : "border-line"} ${drag?.id === c.id ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 py-1">
                <button
                  type="button"
                  aria-label={`Reorder ${c.name}. Drag, or use the up and down arrow keys.`}
                  onPointerDown={(e) => startDrag(c.id, e)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  onKeyDown={(e) => nudge(c.id, e)}
                  className="flex size-11 shrink-0 cursor-grab touch-none items-center justify-center border-0 bg-transparent text-muted"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.8" /><circle cx="15" cy="6" r="1.8" /><circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" /><circle cx="9" cy="18" r="1.8" /><circle cx="15" cy="18" r="1.8" /></svg>
                </button>
                <span className="w-6 font-mono text-[13px] text-muted">{number}</span>
                <div className="flex min-w-0 flex-[1_1_200px] flex-wrap items-center gap-2.5">
                  <span className="text-[15px] font-medium">{c.name}</span>
                  <Pill accent={c.scope === "pb1"}>{SCOPE_LABEL[c.scope]}</Pill>
                </div>

                {/* Instant Quick Viva / Recall Button */}
                <button
                  type="button"
                  aria-label={`Open Quick Viva / Active Recall for ${c.name}`}
                  onClick={() => onOpenViva(c)}
                  className="h-8 rounded-lg border border-accent/40 bg-accent/15 px-2.5 font-mono text-xs font-semibold text-accent-text hover:bg-accent/25 transition-all active:scale-95 shadow-2xs"
                >
                  ⚡ Viva
                </button>

                <div className="flex items-center">
                  {PASS_NAMES.map((full, i) => (
                    <button
                      key={full}
                      type="button"
                      aria-pressed={!!c.passes[i]}
                      aria-label={`${PASS_SHORT[i]} pass for ${c.name}`}
                      onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${i + 1}`, { done: !c.passes[i] })}
                      className="h-11 border-0 bg-transparent px-[3px]"
                    >
                      <span className={`block rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 ${c.passes[i] ? "border-good bg-good/15 font-medium text-good" : "border-line text-muted"}`}>{c.passes[i] ? "✓ " : ""}{PASS_SHORT[i]}</span>
                    </button>
                  ))}
                </div>
                <span className="flex w-14 justify-center"><ConfDots value={c.confidence} /></span>
                <div className="flex">
                  <button type="button" aria-label={`Edit ${c.name}`} onClick={() => { setEditing(c.id); setDeleting(null); }} className="flex size-11 items-center justify-center border-0 bg-transparent text-muted"><Icon d={ICONS.edit} size={18} /></button>
                  <button type="button" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c.id)} className="flex size-11 items-center justify-center border-0 bg-transparent text-muted"><Icon d={ICONS.trash} size={18} /></button>
                </div>
              </div>
              {deleting === c.id && (
                <div role="alert" className="mx-0 mt-1 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3 lg:ml-11">
                  <span className="text-[14px]">Delete {c.name}? Its daily targets and revision passes go with it.</span>
                  <div className="flex gap-2">
                    <Btn kind="outline" className="px-[18px]" onClick={() => setDeleting(null)}>Cancel</Btn>
                    <Btn className="border-0 bg-fg px-[18px] font-semibold text-bg" onClick={async () => { if (await act("DELETE", `/api/chapters/${c.id}`)) setDeleting(null); }}>Delete chapter</Btn>
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
    <form className="flex flex-wrap items-end gap-3 py-4" onSubmit={submit}>
      <div className="flex flex-[1_1_240px] flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-[13px] text-muted">Chapter name</label>
        <input id={`${id}-name`} autoFocus value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-11 rounded-xl border border-accent bg-bg px-3.5 text-[15px] text-fg" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-scope`} className="text-[13px] text-muted">Scope</label>
        <select id={`${id}-scope`} value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value as Scope })} className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg">
          {SCOPES.map((s) => <option key={s} value={s}>{SCOPE_LABEL[s]}</option>)}
        </select>
      </div>
      {editing && (
        <div className="flex flex-col gap-1.5">
          <span id={`${id}-conf`} className="text-[13px] text-muted">Confidence</span>
          <div role="group" aria-labelledby={`${id}-conf`} className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={v.confidence === n} aria-label={`Confidence ${n} of 5`} onClick={() => setV({ ...v, confidence: n })} className={`size-11 rounded-xl border text-[14px] ${v.confidence === n ? "border-accent bg-accent font-semibold text-ink" : "border-line bg-bg text-fg"}`}>{n}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Btn type="submit" kind="primary" disabled={saving} className="px-[18px]">{saving ? "Saving…" : saveLabel}</Btn>
        <Btn kind="outline" className="px-[18px]" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

/** Where the four phases' dates are edited. Only Pre-Boards 1 is confirmed; the rest are placeholders. */
function PhaseDates({ state, act }: { state: State; act: Act }) {
  return (
    <details className="rounded-2xl border border-line bg-surface px-4 py-4 lg:px-6 lg:py-5">
      <summary className="flex min-h-11 cursor-pointer items-center text-[17px] font-semibold">Exam phases and dates</summary>
      <p className="mt-1 mb-2 text-[13px] text-muted">Pre-Boards 1 dates are from the school calendar. The others are placeholders: correct them when the datesheets come out, then tick Confirmed.</p>
      <ul className="m-0 list-none p-0">
        {state.phases.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3">
            <strong className="text-[15px]">{p.name}</strong>
            <span className="flex flex-wrap items-center gap-2">
              <input type="date" aria-label={`${p.name} starts`} value={p.startsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { startsOn: e.target.value })} className="h-11 rounded-xl border border-line bg-bg px-3 text-[14px] text-fg" />
              <span className="text-muted">to</span>
              <input type="date" aria-label={`${p.name} ends`} value={p.endsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { endsOn: e.target.value })} className="h-11 rounded-xl border border-line bg-bg px-3 text-[14px] text-fg" />
              <label className="flex min-h-11 items-center gap-2 text-[14px]">
                <input type="checkbox" checked={p.confirmed} onChange={(e) => act("PUT", `/api/phases/${p.id}`, { confirmed: e.target.checked })} className="size-5 accent-[var(--accent)]" />
                Confirmed
              </label>
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
