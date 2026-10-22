import { useId, useRef, useState, type FormEvent } from "react";
import type { Act, Project, State } from "./api.ts";
import { Btn, Card, Check, H2, plural } from "./ui.tsx";

export function Projects({ state, act }: { state: State; act: Act }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Beyond the syllabus</div>
          <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Projects</h1>
        </div>
        <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add project"}</Btn>
      </header>
      {adding && (
        <Card className="max-w-3xl">
          <ProjectForm saveLabel="Add project" initial={{ name: "", detail: "" }} onCancel={() => setAdding(false)} onSave={async (v) => { if (await act("POST", "/api/projects", v)) setAdding(false); }} />
        </Card>
      )}
      {state.projects.length === 0 && !adding && <Card className="max-w-3xl"><p className="m-0 text-[14px] text-muted">No projects yet. A hobby, a fitness target or a skill: add it and break it into milestones.</p></Card>}
      <div className="flex max-w-3xl flex-col gap-4 lg:gap-6">
        {state.projects.map((p) => <ProjectCard key={p.id} project={p} act={act} />)}
      </div>
    </>
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
    <Card labelledBy={`${id}-h`}>
      {editing ? (
        <ProjectForm saveLabel="Save" initial={{ name: p.name, detail: p.detail }} onCancel={() => setEditing(false)} onSave={async (v) => { if (await act("PATCH", `/api/projects/${p.id}`, v)) setEditing(false); }} />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <H2 id={`${id}-h`}>{p.name}</H2>
            {p.detail && <p className="m-0 mt-1 text-[14px] text-muted">{p.detail}</p>}
          </div>
          <div className="flex">
            <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditing(true)} className="flex min-h-11 items-center border-0 bg-transparent px-3 text-[13px] text-muted">Edit</button>
            <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setRemoving(true)} className="flex min-h-11 items-center border-0 bg-transparent px-3 text-[13px] text-muted">Delete</button>
          </div>
        </div>
      )}
      {removing && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
          <span className="text-[14px]">Delete {p.name}? Its {plural(p.milestones.length, "milestone")} go with it.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-fg font-semibold text-bg" onClick={async () => { if (await act("DELETE", `/api/projects/${p.id}`)) setRemoving(false); }}>Delete project</Btn>
          </div>
        </div>
      )}
      {p.milestones.length > 0 && (
        <div className="mt-3 flex items-center gap-2.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-line"><span className={`block h-full transition-all duration-300 ease-out ${pct === 100 ? "bg-good" : "bg-gradient-to-r from-accent to-accent-text"}`} style={{ width: `${pct}%` }} /></span>
          <span className="font-mono text-xs text-muted">{done} of {p.milestones.length}</span>
        </div>
      )}
      <ul className="m-0 mt-1 list-none p-0">
        {p.milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-2 border-t border-line first:border-t-0">
            <button type="button" role="switch" aria-checked={m.done} aria-label={`${m.title}: ${m.done ? "done" : "not done"}`} onClick={() => act("PATCH", `/api/milestones/${m.id}`, { done: !m.done })} className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent"><Check on={m.done} /></button>
            <span className={`min-w-0 flex-1 text-[15px] ${m.done ? "text-muted line-through" : ""}`}>{m.title}</span>
            <button type="button" aria-label={`Remove ${m.title}`} onClick={() => act("DELETE", `/api/milestones/${m.id}`)} className="flex min-h-11 items-center border-0 bg-transparent px-3 text-[13px] text-muted">Remove</button>
          </li>
        ))}
      </ul>
      <form className="mt-2 flex gap-2 border-t border-line pt-3" onSubmit={addMilestone}>
        <label htmlFor={`${id}-new`} className="sr-only">New milestone for {p.name}</label>
        <input id={`${id}-new`} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a milestone" className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg" />
        <Btn type="submit" disabled={!title.trim() || savingMilestone}>{savingMilestone ? "Adding…" : "Add"}</Btn>
      </form>
    </Card>
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
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-[13px] text-muted">Project name</label>
        <input id={nameId} autoFocus maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-11 rounded-xl border border-accent bg-bg px-3.5 text-[15px] text-fg" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={detailId} className="text-[13px] text-muted">What is it for? (optional)</label>
        <input id={detailId} maxLength={500} value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg" />
      </div>
      <div className="flex gap-2">
        <Btn type="submit" kind="primary" disabled={saving} className="px-[18px]">{saving ? "Saving…" : saveLabel}</Btn>
        <Btn kind="outline" className="px-[18px]" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}

