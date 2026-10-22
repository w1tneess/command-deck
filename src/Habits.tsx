import { useState } from "react";
import type { Act, Habit, State } from "./api.ts";
import { Btn, Card, Check, H2 } from "./ui.tsx";

const LETTER = (day: string) => new Date(day + "T00:00:00Z").toLocaleDateString("en-GB", { weekday: "narrow", timeZone: "UTC" });
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export function Habits({ state, act }: { state: State; act: Act }) {
  const [adding, setAdding] = useState(false);
  const doneToday = state.habits.filter((h) => h.today >= h.goal).length;
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.today, i - 6));
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Every day counts</div>
          <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Habits</h1>
        </div>
        <span className="font-mono text-[14px] text-muted">{doneToday} of {state.habits.length} done today</span>
      </header>
      <Card labelledBy="habits-h" className="max-w-3xl">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <H2 id="habits-h">Today</H2>
          <Btn kind="primary" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add habit"}</Btn>
        </div>
        {adding && <HabitForm saveLabel="Add habit" initial={{ name: "", kind: "tick", goal: 1 }} onCancel={() => setAdding(false)} onSave={async (v) => { if (await act("POST", "/api/habits", v)) setAdding(false); }} />}
        {state.habits.length === 0 && !adding && <p className="m-0 border-t border-line py-4 text-[14px] text-muted">No habits yet. Add one to start a streak.</p>}
        {state.habits.map((h) => <Row key={h.id} habit={h} days={days} act={act} />)}
      </Card>
    </>
  );
}

function Row({ habit: h, days, act }: { habit: Habit; days: string[]; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const done = h.today >= h.goal;
  const log = (value: number) => act("PUT", `/api/habits/${h.id}/log`, { value });
  if (editing) {
    return (
      <div className="border-t border-line">
        <HabitForm saveLabel="Save" initial={{ name: h.name, kind: h.kind, goal: h.goal }} onCancel={() => setEditing(false)} onSave={async (v) => { if (await act("PATCH", `/api/habits/${h.id}`, { name: v.name, goal: v.goal })) setEditing(false); }} />
      </div>
    );
  }
  return (
    <div className="border-t border-line py-3">
      <div className="flex flex-wrap items-center gap-3">
        {h.kind === "tick" ? (
          <button type="button" role="switch" aria-checked={done} aria-label={`${h.name}: ${done ? "done" : "not done"} today`} onClick={() => log(done ? 0 : 1)} className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent"><Check on={done} /></button>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" aria-label={`One fewer for ${h.name}`} disabled={h.today === 0} onClick={() => log(h.today - 1)} className="size-11 rounded-xl border border-line bg-surface2 text-lg">−</button>
            <span className={`w-14 text-center font-mono text-[15px] ${done ? "font-semibold text-good" : ""}`} aria-label={`${h.today} of ${h.goal} today`}>{h.today}/{h.goal}</span>
            <button type="button" aria-label={`One more for ${h.name}`} onClick={() => log(h.today + 1)} className="size-11 rounded-xl border border-line bg-surface2 text-lg">+</button>
          </div>
        )}
        <div className="min-w-0 flex-[1_1_160px]">
          <div className="text-[15px] font-medium">{h.name}</div>
          <div className={`text-[13px] ${h.streak > 0 ? "text-accent-text" : "text-muted"}`}>{h.streak > 0 ? `${h.streak}-day streak` : "No streak yet"}</div>
        </div>
        <div className="flex gap-1.5" role="img" aria-label={`Last 7 days: ${h.last7.map((d, i) => `${LETTER(days[i])} ${d ? "done" : "missed"}`).join(", ")}`}>
          {h.last7.map((d, i) => (
            <span key={days[i]} className="flex flex-col items-center gap-1">
              <span className={`size-4 rounded-full ${d ? "bg-good" : "bg-line"} ${i === 6 ? "outline-2 outline-offset-1 outline-accent-text" : ""}`} />
              <span className="text-[11px] text-muted">{LETTER(days[i])}</span>
            </span>
          ))}
        </div>
        <div className="flex">
          <button type="button" aria-label={`Edit ${h.name}`} onClick={() => setEditing(true)} className="flex size-11 items-center justify-center border-0 bg-transparent text-[13px] text-muted">Edit</button>
          <button type="button" aria-label={`Delete ${h.name}`} onClick={() => setRemoving(true)} className="flex size-11 items-center justify-center border-0 bg-transparent text-[13px] text-muted">Delete</button>
        </div>
      </div>
      {removing && (
        <div role="alert" className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface2 px-4 py-3">
          <span className="text-[14px]">Delete {h.name}? Its streak and history go with it.</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>Cancel</Btn>
            <Btn className="border-0 bg-fg font-semibold text-bg" onClick={async () => { if (await act("DELETE", `/api/habits/${h.id}`)) setRemoving(false); }}>Delete habit</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

type Values = { name: string; kind: "tick" | "count"; goal: number };

function HabitForm({ initial, saveLabel, onSave, onCancel }: { initial: Values; saveLabel: string; onSave: (v: Values) => Promise<void>; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const editing = saveLabel === "Save";
  return (
    <form className="flex flex-wrap items-end gap-3 py-4" onSubmit={(e) => { e.preventDefault(); if (v.name.trim()) void onSave({ ...v, name: v.name.trim() }); }}>
      <div className="flex flex-[1_1_220px] flex-col gap-1.5">
        <label htmlFor="habit-name" className="text-[13px] text-muted">Habit name</label>
        <input id="habit-name" autoFocus maxLength={60} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} className="h-11 rounded-xl border border-accent bg-bg px-3.5 text-[15px] text-fg" />
      </div>
      {!editing && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="habit-kind" className="text-[13px] text-muted">Type</label>
          <select id="habit-kind" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as Values["kind"], goal: e.target.value === "tick" ? 1 : Math.max(2, v.goal) })} className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg">
            <option value="tick">Tick once a day</option>
            <option value="count">Count up to a goal</option>
          </select>
        </div>
      )}
      {v.kind === "count" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="habit-goal" className="text-[13px] text-muted">Daily goal</label>
          <input id="habit-goal" type="number" min={1} max={50} value={v.goal} onChange={(e) => setV({ ...v, goal: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })} className="h-11 w-24 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg" />
        </div>
      )}
      <div className="flex gap-2">
        <Btn type="submit" kind="primary" className="px-[18px]">{saveLabel}</Btn>
        <Btn kind="outline" className="px-[18px]" onClick={onCancel}>Cancel</Btn>
      </div>
    </form>
  );
}
