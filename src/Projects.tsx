import { useId, useRef, useState, type FormEvent } from "react";
import type { Act, Project, State } from "./api.ts";
import { AppleText, Btn, Card, Check, H2, plural } from "./ui.tsx";

export function Projects({ state, act }: { state: State; act: Act }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div>
          <div className="text-xs font-medium text-zinc-400">Beyond the Syllabus</div>
          <h1 className="m-0 mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">Personal Projects & Goals</h1>
        </div>
        <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add Project"}</Btn>
      </header>
      {adding && (
        <Card className="max-w-3xl">
          <ProjectForm saveLabel="Add Project" initial={{ name: "", detail: "" }} onCancel={() => setAdding(false)} onSave={async (v) => { if (await act("POST", "/api/projects", v)) setAdding(false); }} />
        </Card>
      )}
      {state.projects.length === 0 && !adding && (
        <Card className="max-w-3xl">
          <p className="m-0 text-sm text-zinc-400">No personal projects yet. Track a fitness routine, a coding project, or an extracurricular goal broken down into actionable milestones.</p>
        </Card>
      )}
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
            <H2 id={`${id}-h`}><AppleText text={p.name} size={18} /></H2>
            {p.detail && <p className="m-0 mt-1 text-sm text-zinc-400 leading-relaxed"><AppleText text={p.detail} size={14} /></p>}
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label={`Edit ${p.name}`} onClick={() => setEditing(true)} className="flex h-8 px-2.5 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-zinc-400 hover:text-white transition-all">Edit</button>
            <button type="button" aria-label={`Delete ${p.name}`} onClick={() => setRemoving(true)} className="flex h-8 px-2.5 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-zinc-400 hover:text-rose-400 transition-all">Delete</button>
          </div>
        </div>
      )}
      {removing && (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-3">
          <span className="text-xs text-rose-300">Delete "{p.name}"? All {plural(p.milestones.length, "milestone")} will be permanently removed.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-rose-600 font-semibold text-white hover:bg-rose-500" onClick={async () => { if (await act("DELETE", `/api/projects/${p.id}`)) setRemoving(false); }}>Delete project</Btn>
          </div>
        </div>
      )}
      {p.milestones.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <span className={`block h-full transition-all duration-300 ease-out rounded-full ${pct === 100 ? "bg-emerald-400" : "bg-sky-400"}`} style={{ width: `${pct}%` }} />
          </span>
          <span className="font-mono text-xs text-zinc-400">{done} of {p.milestones.length}</span>
        </div>
      )}
      <ul className="m-0 mt-3 list-none p-0 flex flex-col gap-1.5">
        {p.milestones.map((m) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-2.5 transition-all hover:bg-white/[0.04]">
            <button type="button" role="switch" aria-checked={m.done} aria-label={`${m.title}: ${m.done ? "done" : "not done"}`} onClick={() => act("PATCH", `/api/milestones/${m.id}`, { done: !m.done })} className="flex size-7 shrink-0 items-center justify-center border-0 bg-transparent active:scale-95 transition-transform"><Check on={m.done} /></button>
            <span className={`min-w-0 flex-1 text-sm ${m.done ? "text-zinc-500 line-through" : "text-white"}`}>
              <AppleText text={m.title} size={14} />
            </span>
            <button type="button" aria-label={`Remove ${m.title}`} onClick={() => act("DELETE", `/api/milestones/${m.id}`)} className="flex h-7 px-2 items-center rounded-lg border-0 bg-transparent text-xs text-zinc-500 hover:text-rose-400 transition-all">Remove</button>
          </li>
        ))}
      </ul>
      <form className="mt-4 flex gap-2.5 border-t border-white/[0.08] pt-3.5" onSubmit={addMilestone}>
        <label htmlFor={`${id}-new`} className="sr-only">New milestone for {p.name}</label>
        <input id={`${id}-new`} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a specific milestone..." className="h-10 min-w-0 flex-1 rounded-xl border border-white/15 bg-[#161c28] px-3.5 text-sm text-white focus:border-sky-400 transition-all placeholder:text-zinc-500" />
        <Btn type="submit" kind="primary" disabled={!title.trim() || savingMilestone}>{savingMilestone ? "Adding…" : "Add Milestone"}</Btn>
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
    <form className="flex flex-col gap-3.5" onSubmit={submit}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-medium text-zinc-300">Project Title</label>
        <input id={nameId} autoFocus maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Science Exhibition Prototype" className="h-10 rounded-xl border border-white/20 bg-[#161c28] px-3.5 text-sm text-white focus:border-sky-400 transition-all" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={detailId} className="text-xs font-medium text-zinc-300">Objective / Details (Optional)</label>
        <input id={detailId} maxLength={500} value={v.detail} onChange={(e) => setV({ ...v, detail: e.target.value })} placeholder="Key deliverables or target completion dates..." className="h-10 rounded-xl border border-white/10 bg-[#161c28] px-3.5 text-sm text-white focus:border-sky-400 transition-all" />
      </div>
      <div className="flex gap-2.5 pt-1">
        <Btn type="submit" kind="primary" disabled={saving} className="px-5">{saving ? "Saving…" : saveLabel}</Btn>
        <Btn kind="outline" className="px-4" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
