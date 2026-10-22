import { useState } from "react";
import type { Act, Deliverable, DeliverableStatus, State } from "./api.ts";
import { activeOf } from "./model.ts";
import { Btn, Card, H2, daysBetween, fmtShort, plural } from "./ui.tsx";

const STATE_LABEL: Record<DeliverableStatus, string> = { not_started: "Not started", in_progress: "In progress", done: "Done" };
const NEXT: Record<DeliverableStatus, DeliverableStatus> = { not_started: "in_progress", in_progress: "done", done: "not_started" };

/** Page version (own header) and the card that sits beside the Week charts. */
export function DeliverablesPage({ state, act }: { state: State; act: Act }) {
  return (
    <>
      <header>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Class X · 2026-27</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Deliverables</h1>
      </header>
      <div className="max-w-3xl"><Deliverables state={state} act={act} /></div>
    </>
  );
}

export function Deliverables({ state, act }: { state: State; act: Act; embedded?: boolean }) {
  const phase = activeOf(state);
  const items = state.deliverables.filter((d) => d.phaseId === phase.id || d.phaseId === null);
  const overdue = items.filter((d) => d.due && d.status !== "done" && d.due < state.today);
  const anyDue = items.some((d) => d.due);
  const [adding, setAdding] = useState(false);
  return (
    <Card labelledBy="del-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <H2 id="del-h">Deliverables</H2>
        <span className="text-[13px] text-muted">Submitted with {phase.name}</span>
      </div>
      {overdue.length > 0 ? (
        <div role="alert" className="mt-3.5 mb-1.5 rounded-xl border border-accent bg-surface2 px-3.5 py-2.5 text-[13px] font-medium">
          {plural(overdue.length, "deliverable")} overdue: {overdue.map((d) => d.name).join(", ")}.
        </div>
      ) : !anyDue ? (
        <div role="status" className="mt-3.5 mb-1.5 rounded-xl border border-line bg-surface2 px-3.5 py-2.5 text-[13px]">No due dates set. Add one and overdue alerts switch on.</div>
      ) : null}
      {items.length === 0 && <p className="m-0 mt-3 border-t border-line py-4 text-[14px] text-muted">Nothing to submit with {phase.name} yet. Add a deliverable below.</p>}
      {items.map((d) => <Item key={d.id} d={d} today={state.today} act={act} />)}
      <div className="border-t border-line pt-3.5">
        {adding ? <AddForm phaseId={phase.id} act={act} onDone={() => setAdding(false)} /> : <Btn onClick={() => setAdding(true)}>Add deliverable</Btn>}
      </div>
    </Card>
  );
}

function Item({ d, today, act }: { d: Deliverable; today: string; act: Act }) {
  const [editingDue, setEditingDue] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isOverdue = !!d.due && d.status !== "done" && d.due < today;
  const left = d.due ? daysBetween(today, d.due) : null;
  const patch = (body: object) => act("PATCH", `/api/deliverables/${d.id}`, body);
  const pct = d.totalCount ? Math.round(((d.doneCount ?? 0) / d.totalCount) * 100) : 0;
  return (
    <div className="flex flex-col gap-2.5 border-t border-line py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-medium">{d.name}</div>
          <div className="mt-0.5 text-[13px] text-muted">
            {d.subject}{d.detail ? ` · ${d.detail}` : ""}
            {d.due && <span className={isOverdue ? "font-medium text-fg" : ""}> · due {fmtShort(d.due)}{left !== null && d.status !== "done" ? (left < 0 ? ` (${plural(-left, "day")} late)` : left === 0 ? " (today)" : ` (in ${plural(left, "day")})`) : ""}</span>}
          </div>
        </div>
        <button
          type="button"
          aria-label={`${d.name}: ${STATE_LABEL[d.status]}. Tap to change.`}
          onClick={() => patch({ status: NEXT[d.status] })}
          className="-my-2 flex min-h-11 shrink-0 items-center border-0 bg-transparent"
        >
          <span className={`rounded-full border px-2.5 py-[3px] text-xs ${isOverdue ? "border-accent bg-accent font-semibold text-ink" : d.status === "done" ? "border-good text-good" : d.status === "in_progress" ? "border-accent text-fg" : "border-line text-muted"}`}>
            {isOverdue ? "Overdue" : d.status === "done" ? "✓ Done" : STATE_LABEL[d.status]}
          </span>
        </button>
      </div>
      {d.totalCount !== null && (
        <div className="flex items-center gap-2.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-line"><span className="block h-full bg-accent" style={{ width: `${pct}%` }} /></span>
          <span className="font-mono text-xs text-muted" aria-label={`${d.doneCount} of ${d.totalCount} done`}>{d.doneCount} of {d.totalCount}</span>
          <button type="button" aria-label={`One fewer done for ${d.name}`} disabled={!d.doneCount} onClick={() => patch({ doneCount: (d.doneCount ?? 0) - 1 })} className="size-11 rounded-xl border border-line bg-surface2 text-lg">−</button>
          <button type="button" aria-label={`One more done for ${d.name}`} disabled={d.doneCount === d.totalCount} onClick={() => patch({ doneCount: (d.doneCount ?? 0) + 1 })} className="size-11 rounded-xl border border-line bg-surface2 text-lg">+</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {editingDue ? (
          <>
            <input type="date" aria-label={`Due date for ${d.name}`} value={d.due ?? ""} onChange={(e) => patch({ due: e.target.value || null })} className="h-11 rounded-xl border border-line bg-bg px-3 text-[13px] text-fg" />
            <Btn className="px-3.5 text-[13px]" onClick={() => setEditingDue(false)}>Done</Btn>
            {d.due && <Btn kind="ghost" className="px-3.5 text-[13px]" onClick={() => patch({ due: null })}>Clear</Btn>}
          </>
        ) : (
          <Btn className="px-3.5 text-[13px]" onClick={() => setEditingDue(true)}>{d.due ? `Due ${fmtShort(d.due)}` : "Set due date"}</Btn>
        )}
        <button
          type="button"
          aria-pressed={d.vivaPrep}
          onClick={() => patch({ vivaPrep: !d.vivaPrep })}
          className={`h-11 rounded-xl border px-3.5 text-[13px] ${d.vivaPrep ? "border-accent bg-accent font-semibold text-ink" : "border-line bg-transparent text-muted"}`}
        >
          Viva prep
        </button>
        <Btn kind="ghost" className="ml-auto px-3.5 text-[13px]" aria-label={`Remove ${d.name}`} onClick={() => setRemoving(true)}>Remove</Btn>
      </div>
      {removing && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
          <span className="text-[14px]">Remove {d.name}?</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-fg font-semibold text-bg" onClick={() => act("DELETE", `/api/deliverables/${d.id}`)}>Remove</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({ phaseId, act, onDone }: { phaseId: string; act: Act; onDone: () => void }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [steps, setSteps] = useState("");
  const field = "h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg";
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !subject.trim()) return;
        await act("POST", "/api/deliverables", { name, subject, phaseId, ...(steps ? { totalCount: Number(steps) } : {}) });
        onDone();
      }}
    >
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Name<input value={name} onChange={(e) => setName(e.target.value)} autoFocus className={field} /></label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Subject<input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Maths" className={field} /></label>
      <label className="flex flex-col gap-1.5 text-[13px] text-muted">Steps to count (optional)<input type="number" min={1} max={100} inputMode="numeric" value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="12" className={field} /></label>
      <div className="flex gap-2"><Btn type="submit" kind="primary">Add deliverable</Btn><Btn kind="outline" onClick={onDone}>Cancel</Btn></div>
    </form>
  );
}
