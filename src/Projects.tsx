import { useId, useRef, useState, type FormEvent } from "react";
import type { Act, Project, State } from "./api.ts";
import { AppleText, Btn, Check, H2, plural, PageHeader } from "./ui.tsx";

const CARD = "min-w-0 rounded-2xl bg-surface2 p-4 ring-1 ring-line text-fg";

export function Projects({ state, act }: { state: State; act: Act }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex w-full flex-col gap-4 md:gap-6">
      <PageHeader title="Projects" sub="Goals beyond the syllabus, in small steps.">
        <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add Project"}</Btn>
      </PageHeader>
      {adding && (
        <section className={CARD}>
          <ProjectForm saveLabel="Add Project" initial={{ name: "", detail: "" }} onCancel={() => setAdding(false)} onSave={async (v) => { if (await act("POST", "/api/projects", v)) setAdding(false); }} />
        </section>
      )}
      {state.projects.length === 0 && !adding && (
        <section className={CARD}>
          <p className="m-0 text-sm text-muted">No personal projects yet. Track a fitness routine, a coding project, or an extracurricular goal broken down into actionable milestones.</p>
        </section>
      )}
      <div className="flex flex-col gap-3 md:gap-4">
        {state.projects.map((p) => <ProjectCard key={p.id} project={p} act={act} />)}
      </div>
    </div>
  );
}

function ProjectCard({ project: p, act }: { project: Project; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [title, setTitle] = useState("");
  const busy = useRef(false);
  const done = p.milestones.filter((m) => m.done).length;
  const pct = p.milestones.length ? Math.round((done / p.milestones.length) * 100) : 0;
  const id = useId();

  const [savingMilestone, setSavingMilestone] = useState(false);

  const addMilestone = async (e: FormEvent) => {
    e.preventDefault();
    const toSave = title.trim();
    if (!toSave || busy.current) return;
    busy.current = true;
    setSavingMilestone(true);
    try {
      if (await act("POST", `/api/projects/${p.id}/milestones`, { title: toSave })) {
        setTitle((cur) => (cur.trim() === toSave ? "" : cur));
      }
    } finally {
      busy.current = false;
      setSavingMilestone(false);
    }
  };

  return (
    <section aria-labelledby={`${id}-h`} className={CARD}>
      {editing ? (
        <ProjectForm saveLabel="Save" initial={{ name: p.name, detail: p.detail }} onCancel={() => setEditing(false)} onSave={async (v) => { if (await act("PATCH", `/api/projects/${p.id}`, v)) setEditing(false); }} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <H2 id={`${id}-h`}><AppleText text={p.name} size={18} /></H2>
            {p.detail && <p className="m-0 mt-1 text-sm text-muted leading-relaxed"><AppleText text={p.detail} size={14} /></p>}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditing(true)} className="flex min-h-[44px] md:min-h-[38px] px-3 items-center justify-center rounded-lg border-0 bg-transparent text-sm text-muted hover:text-fg transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus">Edit</button>
            <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setRemoving(true)} className="flex min-h-[44px] md:min-h-[38px] px-3 items-center justify-center rounded-lg border-0 bg-transparent text-sm text-muted hover:text-danger transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus">Delete</button>
          </div>
        </div>
      )}
      {removing && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <span className="text-xs text-danger">Delete "{p.name}"? All {plural(p.milestones.length, "milestone")} will be permanently removed.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-danger font-semibold text-on-solid hover:opacity-90" onClick={async () => { if (await act("DELETE", `/api/projects/${p.id}`)) setRemoving(false); }}>Delete project</Btn>
          </div>
        </div>
      )}
      {p.milestones.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface3">
            <span className={`block h-full transition-all duration-300 ease-out rounded-full ${pct === 100 ? "bg-accent" : "bg-fg"}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="font-mono text-xs text-muted">{done} of {p.milestones.length}</span>
        </div>
      )}
      <ul className="m-0 mt-3 list-none p-0 flex flex-col gap-2 md:gap-3">
        {p.milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl bg-surface px-3">
            <button type="button" role="switch" aria-checked={m.done} aria-label={`${m.title}: ${m.done ? "done" : "not done"}`} onClick={() => act("PATCH", `/api/milestones/${m.id}`, { done: !m.done })} className="flex size-11 md:size-[38px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent cursor-pointer active:scale-95 transition-transform focus-visible:ring-2 focus-visible:ring-focus"><Check on={m.done} /></button>
            <span className={`min-w-0 flex-1 text-sm ${m.done ? "text-muted line-through" : "text-fg"}`}>
              <AppleText text={m.title} size={14} />
            </span>
            <button type="button" aria-label={`Remove ${m.title}`} onClick={() => act("DELETE", `/api/milestones/${m.id}`)} className="flex min-h-[44px] md:min-h-[38px] px-3 items-center rounded-lg border-0 bg-transparent text-sm text-muted hover:text-danger transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-focus">Remove</button>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex gap-2.5" onSubmit={addMilestone}>
        <label htmlFor={`${id}-new`} className="sr-only">New milestone for {p.name}</label>
        <input id={`${id}-new`} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a specific milestone..." className="h-11 md:h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus transition-all placeholder:text-muted" />
        <Btn type="submit" kind="primary" disabled={!title.trim() || savingMilestone}>{savingMilestone ? "Adding…" : "Add Milestone"}</Btn>
      </form>
    </section>
  );
}

function ProjectForm({ initial, saveLabel, onSave, onCancel }: { initial: { name: string; detail: string }; saveLabel: string; onSave: (v: { name: string; detail: string }) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const uid = useId();
  const nameId = `${uid}-name`;
  const detailId = `${uid}-detail`;

  const submit = async (e: FormEvent) => {
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
    <form className="flex flex-col gap-3.5" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-medium text-fg/80">Project Title</label>
        <input id={nameId} autoFocus maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Science Exhibition Prototype" className="h-11 md:h-10 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus transition-all" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={detailId} className="text-xs font-medium text-fg/80">Objective / Details (Optional)</label>
        <input id={detailId} maxLength={500} value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} placeholder="Key deliverables or target completion dates..." className="h-11 md:h-10 rounded-xl border border-line bg-surface px-3.5 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus transition-all" />
      </div>
      <div className="flex gap-2.5 pt-1">
        <Btn type="submit" kind="primary" disabled={saving} className="px-5">{saving ? "Saving…" : saveLabel}</Btn>
        <Btn kind="outline" className="px-4" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
