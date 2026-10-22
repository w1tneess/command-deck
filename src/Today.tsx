import { useState } from "react";
import { ENERGIES, type Energy } from "../server/planner.ts";
import type { Act, Phase, State } from "./api.ts";
import { FocusCard, type FocusModel } from "./Focus.tsx";
import { activeOf, chapterIndex, reasonFor, studyQueueFor, whenOf } from "./model.ts";
import { Btn, Card, Check, ConfDots, H2, PassPills, Pill, fmtLong, fmtShort, fmtWeekdayDate } from "./ui.tsx";

const ENERGY_LABEL: Record<Energy, string> = { low: "Low", ok: "OK", high: "High" };
const ENERGY_NOTE = "Low puts lighter chapters first. High puts the hardest first.";

export function Today({ state, act, focus }: { state: State; act: Act; focus: FocusModel }) {
  return (
    <>
      <Header state={state} act={act} />
      <Hero state={state} />
      <div className="flex flex-wrap items-start gap-4 lg:gap-6">
        <div className="flex min-w-0 flex-[3_1_460px] flex-col gap-4 lg:gap-6">
          <Targets state={state} act={act} />
          <Queue state={state} />
        </div>
        {/* On a phone this column holds only the energy row, which sits above the targets. */}
        <div className="order-first flex min-w-0 flex-[2_1_320px] flex-col gap-6 lg:order-none">
          <div className="hidden lg:block"><FocusCard focus={focus} state={state} /></div>
          <Energy state={state} act={act} />
        </div>
      </div>
    </>
  );
}

function Header({ state, act }: { state: State; act: Act }) {
  const upcoming = state.phases.find((p) => state.today <= p.endsOn) ?? activeOf(state);
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 lg:gap-4">
      <div>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">{fmtWeekdayDate(state.today)}</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Today</h1>
      </div>
      <label className="flex items-center gap-3">
        <span className="hidden text-[13px] text-muted lg:inline">Phase</span>
        <select
          aria-label="Phase"
          title={state.autoPhase ? "Following the calendar" : "Chosen by you"}
          value={state.autoPhase ? "auto" : (state.activePhaseId ?? "auto")}
          onChange={(e) => act("PUT", "/api/active-phase", { phaseId: e.target.value === "auto" ? null : e.target.value })}
          className="h-11 rounded-full border border-line bg-surface px-3 text-[13px] text-muted lg:h-11 lg:rounded-xl lg:px-3.5 lg:text-[14px] lg:text-fg"
        >
          <option value="auto">Auto: {upcoming.name}</option>
          {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    </header>
  );
}

function Hero({ state }: { state: State }) {
  const phase = activeOf(state);
  const over = state.today > phase.endsOn;
  const started = !over && phase.daysLeft <= 0;
  const subjectDates = state.subjects.some((s) => s.examDates[phase.id]);
  const big = over ? "Over" : String(started ? Math.max(0, daysTo(state.today, phase)) : phase.daysLeft);
  const unit = over ? "" : started ? "days left" : "days to go";
  return (
    <section aria-label="Countdown" className="flex flex-wrap items-center justify-between gap-7 rounded-[18px] bg-accent px-5 py-[18px] text-ink lg:rounded-[20px] lg:px-8 lg:py-7">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.08em] lg:text-[13px]">{phase.name}</div>
        <div className="mt-0.5 flex items-baseline gap-2.5 lg:mt-1.5 lg:gap-3.5">
          <span className="text-[64px] leading-none font-bold tracking-[-0.04em] lg:text-[104px]">{big}</span>
          <span className="text-lg font-medium lg:text-[22px]">{unit}</span>
        </div>
        <div className="mt-1.5 text-[13px] text-ink/85 lg:mt-2.5 lg:text-[14px]">
          {fmtShort(phase.startsOn)} to {fmtLong(phase.endsOn)}
          {!phase.confirmed && " · dates approximate"}
          {!over && !subjectDates && <span className="hidden lg:inline"> · subject dates not set yet</span>}
        </div>
      </div>
      <ol className="m-0 hidden min-w-[260px] flex-[0_1_340px] list-none flex-col gap-1.5 p-0 lg:flex">
        {state.phases.map((p: Phase) => (
          <li key={p.id} aria-current={p.id === phase.id ? "true" : undefined} className={`flex items-baseline justify-between gap-3 rounded-[10px] px-3 py-2 ${p.id === phase.id ? "bg-ink/20" : "bg-ink/10"}`}>
            <span className="text-[14px] font-semibold">{p.name}</span>
            <span className="text-[13px] text-ink/85">{whenOf(p)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Days left in a phase that has already begun. */
const daysTo = (today: string, p: Phase) => Math.round((Date.parse(p.endsOn) - Date.parse(today)) / 86_400_000);

function Targets({ state, act }: { state: State; act: Act }) {
  const index = chapterIndex(state);
  const [adding, setAdding] = useState(false);
  const done = state.targets.filter((t) => t.done).length;
  return (
    <Card labelledBy="targets-h">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <H2 id="targets-h">Daily targets</H2>
          <span className="text-[13px] text-muted">{done} of {state.targets.length} done</span>
        </div>
        <Btn aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add chapter"}</Btn>
      </div>
      {adding && <AddTarget state={state} act={act} onDone={() => setAdding(false)} />}
      {state.targets.length === 0 && <p className="m-0 border-t border-line py-4 text-[14px] text-muted">Nothing planned. Add a target to start the day.</p>}
      {state.targets.map((t) => {
        const hit = t.chapterId ? index.get(t.chapterId) : undefined;
        return <TargetRow key={t.id} id={t.id} done={t.done} name={hit ? hit.chapter.name : t.title} sub={hit ? `${hit.subject.name} · ${reasonFor(hit.chapter)}` : "Your own target"} swappable={!!t.chapterId && !t.done} act={act} />;
      })}
      <div className="border-t border-line pt-3 text-[13px] text-muted">Three suggested a day, up to eight with your own.</div>
    </Card>
  );
}

function TargetRow({ id, done, name, sub, swappable, act }: { id: number; done: boolean; name: string; sub: string; swappable: boolean; act: Act }) {
  const [more, setMore] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-line py-1 lg:gap-2 lg:py-2.5">
      <button type="button" aria-label={`${done ? "Mark not done" : "Mark done"}: ${name}`} aria-pressed={done} onClick={() => act("PATCH", `/api/targets/${id}`, { done: !done })} className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent p-0">
        <Check on={done} />
      </button>
      <div className="min-w-0 flex-1 basis-[180px]">
        <div className={`text-[15px] font-medium lg:text-base ${done ? "text-muted line-through" : ""}`}>{name}</div>
        <div className="text-xs text-muted lg:mt-0.5 lg:text-[13px]">{sub}</div>
      </div>
      <button type="button" aria-label={`More actions for ${name}`} aria-expanded={more} onClick={() => setMore((m) => !m)} className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent text-muted lg:hidden">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
      </button>
      <div className={`${more ? "flex basis-full justify-end" : "hidden"} gap-1 lg:flex lg:basis-auto`}>
        {swappable && <Btn kind="ghost" className="px-3" onClick={() => act("POST", `/api/targets/${id}/swap`)}>Swap</Btn>}
        <Btn kind="ghost" className="px-3" aria-label={`Remove ${name}`} onClick={() => act("DELETE", `/api/targets/${id}`)}>Remove</Btn>
      </div>
    </div>
  );
}

/** Add a chapter from the syllabus, or type a target of your own. */
function AddTarget({ state, act, onDone }: { state: State; act: Act; onDone: () => void }) {
  const [chapterId, setChapterId] = useState("");
  const [text, setText] = useState("");
  const planned = new Set(state.targets.map((t) => t.chapterId));
  const submit = async () => {
    if (!chapterId && !text.trim()) return;
    await act("POST", "/api/targets", chapterId ? { chapterId } : { title: text });
    setChapterId(""); setText(""); onDone();
  };
  return (
    <form className="mb-2 flex flex-wrap items-end gap-3 border-t border-line py-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] text-muted">
        Chapter
        <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg">
          <option value="">Pick a chapter</option>
          {state.subjects.filter((s) => s.chapters.length).map((s) => (
            <optgroup key={s.id} label={s.name}>
              {s.chapters.filter((c) => !planned.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="flex min-w-[200px] flex-[1_1_220px] flex-col gap-1.5 text-[13px] text-muted">
        Or write your own
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Finish the Maths lab file" disabled={!!chapterId} className="h-11 rounded-xl border border-line bg-bg px-3.5 text-[15px] text-fg disabled:opacity-50" />
      </label>
      <Btn type="submit" kind="primary">Add target</Btn>
    </form>
  );
}

function Queue({ state }: { state: State }) {
  const picks = studyQueueFor(state);
  const phase = activeOf(state);
  const over = state.today > phase.endsOn;
  return (
    <Card labelledBy="queue-h">
      <div className="mb-2 flex flex-wrap items-baseline gap-3">
        <H2 id="queue-h">Study queue</H2>
        <span className="text-[13px] text-muted">Ranked by confidence and exam dates</span>
      </div>
      {picks.length === 0 && (
        <p className="m-0 border-t border-line py-4 text-[14px] text-muted">
          {over ? "This phase is over. Switch phase above to plan the next one." : "Nothing left in scope. Add chapters under Syllabus, or switch phase."}
        </p>
      )}
      {picks.map((q, i) => (
        <div key={q.chapterId} className="flex flex-wrap items-center gap-3.5 border-t border-line py-3">
          <span className="w-5 font-mono text-[13px] text-muted">{i + 1}</span>
          <div className="min-w-0 flex-[1_1_200px]">
            <div className="text-[15px] font-medium">{q.chapter.name}</div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <Pill>{q.subject.name}</Pill>
              <ConfDots value={q.chapter.confidence} />
            </div>
          </div>
          <PassPills passes={q.chapter.passes} />
        </div>
      ))}
    </Card>
  );
}

function Energy({ state, act }: { state: State; act: Act }) {
  return (
    <section aria-label="Energy check-in" className="flex items-center gap-2 lg:flex-col lg:items-stretch lg:gap-3.5 lg:rounded-2xl lg:border lg:border-line lg:bg-surface lg:px-6 lg:py-5">
      <h2 className="m-0 hidden text-[17px] font-semibold lg:block">Energy check-in</h2>
      <span className="w-[52px] text-[13px] text-muted lg:hidden">Energy</span>
      <div className="flex flex-1 gap-2" role="group" aria-label="Energy today">
        {ENERGIES.map((e) => (
          <button
            key={e}
            type="button"
            aria-pressed={state.checkin === e}
            onClick={() => act("POST", "/api/checkin", { energy: e })}
            className={`h-11 flex-1 rounded-xl border text-[15px] font-medium ${state.checkin === e ? "border-accent bg-accent text-ink" : "border-line bg-surface text-fg lg:bg-surface2"}`}
          >
            {ENERGY_LABEL[e]}
          </button>
        ))}
      </div>
      <p className="m-0 hidden text-[13px] text-muted lg:block">{ENERGY_NOTE}</p>
    </section>
  );
}
