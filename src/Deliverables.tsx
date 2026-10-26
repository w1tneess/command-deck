import { useEffect, useId, useRef, useState } from "react";
import type { Act, Chapter, Deliverable, DeliverableStatus, State, Subject } from "./api.ts";
import { activeOf } from "./model.ts";
import { AppleEmoji, AppleText, Btn, Card, H2, daysBetween, fmtShort, plural, PageHeader } from "./ui.tsx";
import { getDeliverableGCalUrl, getVivaPrepGCalUrl } from "./calendar-utils.ts";
import { CalendarModal } from "./CalendarModal.tsx";

const STATE_LABEL: Record<DeliverableStatus, string> = { not_started: "Not started", in_progress: "In progress", done: "Done" };
const NEXT: Record<DeliverableStatus, DeliverableStatus> = { not_started: "in_progress", in_progress: "done", done: "not_started" };

const PRACTICAL_VIVA_TARGETS = [
  { chapterSearch: "chemical reactions", subjectId: "science", title: "Chemistry: Types of Reactions & pH of Samples", lab: "Experiment 1 & 2" },
  { chapterSearch: "acids, bases", subjectId: "science", title: "Chemistry: Properties of Acids & Bases (Litmus & Zn)", lab: "Experiment 3 & 4" },
  { chapterSearch: "metals", subjectId: "science", title: "Chemistry: Reactivity Series of Metals", lab: "Experiment 5" },
  { chapterSearch: "life processes", subjectId: "science", title: "Biology: Stomata Mount & Respiration CO2", lab: "Experiment 6 & 7" },
  { chapterSearch: "light", subjectId: "science", title: "Physics: Refraction through Glass Slab & Prism, Lens Image", lab: "Experiment 8 & 9" },
  { chapterSearch: "electricity", subjectId: "science", title: "Physics: Verification of Ohm's Law & Series/Parallel Resistors", lab: "Experiment 10 & 11" },
  { chapterSearch: "electronic spreadsheet", subjectId: "it", title: "IT: Electronic Spreadsheet Macros & Data Analysis", lab: "IT Practical File" },
  { chapterSearch: "database", subjectId: "it", title: "IT: Database Management System & SQL Queries", lab: "IT SQL Assignment" },
];

export function PracticalVivaWatchdog({ state, onOpenViva }: { state: State; onOpenViva?: (chapter: Chapter, subject: Subject) => void }) {
  const [checkedLabs, setCheckedLabs] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem("lifeos_practical_viva_checks");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleCheck = (key: string) => {
    const updated = { ...checkedLabs, [key]: !checkedLabs[key] };
    setCheckedLabs(updated);
    try {
      localStorage.setItem("lifeos_practical_viva_checks", JSON.stringify(updated));
    } catch {}
  };

  const findChapterAndSubject = (search: string, subId: string) => {
    const sub = state.subjects.find((s) => s.id === subId);
    if (!sub) return null;
    const ch = sub.chapters.find((c) => c.name.toLowerCase().includes(search.toLowerCase()));
    return ch ? { chapter: ch, subject: sub } : null;
  };

  return (
    <Card labelledBy="viva-watchdog-h" className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 items-center justify-center rounded-lg bg-warn/15 text-warn">
            <AppleEmoji emoji="⚡" size={14} />
          </span>
          <div>
            <h2 id="viva-watchdog-h" className="font-sans font-semibold text-base text-fg">
              Practical viva prep
            </h2>
            <p className="m-0 text-xs text-muted">
              Lab manual experiments & oral exam readiness tied directly to Class 10 syllabus chapters
            </p>
          </div>
        </div>
        <span className="font-mono text-xs text-warn bg-warn/15 border border-warn/30 px-2 py-0.5 rounded">
          {Object.values(checkedLabs).filter(Boolean).length}/{PRACTICAL_VIVA_TARGETS.length} Prepared
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        {PRACTICAL_VIVA_TARGETS.map((t) => {
          const match = findChapterAndSubject(t.chapterSearch, t.subjectId);
          const done = !!checkedLabs[t.title];

          return (
            <div
              key={t.title}
              className={`flex flex-col justify-between gap-3 rounded-2xl bg-surface2 p-4 ring-1 transition-all ${
                done ? "ring-accent/40" : "ring-line"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                  <button
                    type="button"
                    aria-label={`Toggle preparation status for ${t.title}`}
                    onClick={() => toggleCheck(t.title)}
                    className="-ml-2 -mt-2 flex size-11 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent cursor-pointer active:scale-95 transition-all md:size-8 focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="flex size-5 items-center justify-center rounded border border-line-strong bg-surface">
                      {done && <span className="text-accent text-xs font-bold">✓</span>}
                    </span>
                  </button>
                  <div className="flex flex-col min-w-0">
                    <span className={`font-sans text-xs font-semibold ${done ? "text-muted line-through" : "text-fg"}`}>
                      {t.title}
                    </span>
                    <span className="font-mono text-xs text-muted mt-0.5">
                      {t.lab}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="font-mono text-[11px] text-muted  ">
                  {t.subjectId.toUpperCase()} VIVA
                </span>
                <div className="flex items-center gap-1.5">
                  <a
                    href={getVivaPrepGCalUrl(t.title, t.lab, state.today)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Add ${t.title} Viva Prep to Google Calendar`}
                    title="Add Viva Prep Session to Google Calendar"
                    className="min-h-[44px] md:min-h-[38px] rounded-lg border border-line bg-surface hover:bg-surface3 px-3 font-mono text-xs text-muted hover:text-fg transition-all flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <AppleEmoji emoji="📅" size={12} />
                    <span className="text-[11px]">Add Cal</span>
                  </a>
                  {match && onOpenViva && (
                    <button
                      type="button"
                      aria-label={`Launch Practical Viva for ${t.title}`}
                      onClick={() => onOpenViva(match.chapter, match.subject)}
                      className="min-h-[44px] md:min-h-[38px] rounded-lg border border-warn/30 bg-warn/15 hover:bg-warn/15 px-3 font-mono text-xs font-semibold text-warn transition-all active:scale-95 flex items-center gap-1 cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <AppleEmoji emoji="⚡" size={12} />
                      <span>Launch Viva</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Page version (own header) and the card that sits beside the Week charts. */
export function DeliverablesPage({
  state,
  act,
  onOpenViva,
}: {
  state: State;
  act: Act;
  onOpenViva?: (chapter: Chapter, subject: Subject) => void;
}) {
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 md:max-w-3xl">
      <PageHeader title="Due dates" sub="Lab manuals, projects and practicals for Class X.">
        <button
          type="button"
          onClick={() => setShowCalendarModal(true)}
          className="min-h-[44px] md:min-h-[38px] px-3 rounded-xl border border-accent/30 bg-accent/15 hover:bg-accent/15 text-accent text-sm font-medium transition-all flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>📅</span>
          <span>Subscribe in Google Calendar</span>
        </button>
      </PageHeader>
      <Deliverables state={state} act={act} onOpenViva={onOpenViva} />
      <PracticalVivaWatchdog state={state} onOpenViva={onOpenViva} />

      {showCalendarModal && (
        <CalendarModal state={state} act={act} onClose={() => setShowCalendarModal(false)} />
      )}
    </div>
  );
}

export function Deliverables({
  state,
  act,
  onOpenViva,
  embedded,
}: {
  state: State;
  act: Act;
  onOpenViva?: (chapter: Chapter, subject: Subject) => void;
  embedded?: boolean;
}) {
  const phase = activeOf(state);
  const rawItems = state.deliverables.filter((d) => d.phaseId === phase.id || d.phaseId === null);

  // Auto-sort items: overdue first, then urgent (<72h), then nearest due date, completed at the bottom
  const items = [...rawItems].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const aOverdue = a.due && a.due < state.today;
    const bOverdue = b.due && b.due < state.today;
    if (aOverdue && !bOverdue) return -1;
    if (bOverdue && !aOverdue) return 1;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  });

  const overdue = items.filter((d) => d.due && d.status !== "done" && d.due < state.today);
  const anyDue = items.some((d) => d.due);
  const [adding, setAdding] = useState(false);
  return (
    <section aria-labelledby="del-h" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <H2 id="del-h">For {phase.name}</H2>
      </div>
      {overdue.length > 0 ? (
        <div role="alert" className="mt-4 mb-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-xs sm:text-sm text-danger flex items-center gap-2">
          <AppleEmoji emoji="⚠️" size={15} />
          <span>{plural(overdue.length, "deliverable")} overdue: {overdue.map((d) => d.name).join(", ")}.</span>
        </div>
      ) : !anyDue ? (
        <div role="status" className="mt-4 mb-2 rounded-xl border border-line bg-surface2 px-4 py-3 text-xs text-muted">No due dates set yet. Add target dates to enable timely reminders.</div>
      ) : null}
      {items.length === 0 && <p className="m-0 mt-4 border-t border-line py-5 text-sm text-muted">Nothing to submit with {phase.name} yet. Add a deliverable below.</p>}
      <div className="mt-3 flex flex-col gap-3 md:gap-4">
        {items.map((d) => <Item key={d.id} d={d} today={state.today} act={act} />)}
      </div>
      <div className="pt-4">
        {adding ? <AddForm phaseId={phase.id} act={act} onDone={() => setAdding(false)} /> : <Btn onClick={() => setAdding(true)}>Add a due date</Btn>}
      </div>
    </section>
  );
}

function Item({ d, today, act }: { d: Deliverable; today: string; act: Act }) {
  const [editingDue, setEditingDue] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isOverdue = !!d.due && d.status !== "done" && d.due < today;
  const left = d.due ? daysBetween(today, d.due) : null;
  const isUrgent = !!d.due && d.status !== "done" && !isOverdue && left !== null && left <= 3;
  const patch = (body: object) => act("PATCH", `/api/deliverables/${d.id}`, body);

  // Optimistic stepper with promise queue to avoid dropping rapid clicks
  const [optimisticCount, setOptimisticCount] = useState(d.doneCount ?? 0);
  const latestRef = useRef(d.doneCount ?? 0);
  const serverCountRef = useRef(d.doneCount ?? 0);
  const pending = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    serverCountRef.current = d.doneCount ?? 0;
    if (pending.current === 0) {
      latestRef.current = d.doneCount ?? 0;
      setOptimisticCount(d.doneCount ?? 0);
    }
  }, [d.doneCount]);

  const stepCount = (delta: number) => {
    if (d.totalCount === null) return;
    const next = Math.max(0, Math.min(d.totalCount, latestRef.current + delta));
    latestRef.current = next;
    setOptimisticCount(next);
    pending.current++;
    queueRef.current = queueRef.current
      .then(async () => {
        const ok = await patch({ doneCount: next });
        pending.current--;
        if (!ok) {
          latestRef.current = serverCountRef.current;
          setOptimisticCount(serverCountRef.current);
        }
      })
      .catch(() => {
        pending.current--;
        latestRef.current = serverCountRef.current;
        setOptimisticCount(serverCountRef.current);
      });
  };

  const countToShow = d.totalCount !== null ? optimisticCount : 0;
  const pct = d.totalCount ? Math.round((countToShow / d.totalCount) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface2 p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-medium text-fg">
              <AppleText text={d.name} size={16} />
            </span>
            {d.vivaPrep && (
              <span className="rounded-full bg-surface3 px-2 py-0.5 text-xs font-medium text-muted">Viva</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-muted">
            <span>{d.subject}</span>{d.detail ? ` · ${d.detail}` : ""}
            {d.due && (
              <span className={isOverdue ? "font-semibold text-danger" : isUrgent ? "font-semibold text-warn" : ""}>
                {" "}· due {fmtShort(d.due)}
                {left !== null && d.status !== "done" && (
                  <span className={`font-mono tabular-nums ${isOverdue || isUrgent ? "" : "text-accent"}`}>
                    {left < 0 ? ` (${plural(-left, "day")} late)` : left === 0 ? " (today)" : ` (in ${plural(left, "day")})`}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label={`${d.name}: ${STATE_LABEL[d.status]}. Tap to change.`}
          onClick={() => patch({ status: NEXT[d.status] })}
          className="flex min-h-[44px] md:min-h-[38px] shrink-0 items-center rounded-full border-0 bg-transparent cursor-pointer focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span
            className={`rounded-full border px-3 py-0.5 text-xs font-medium tracking-wide transition-all ${
              isOverdue
                ? "border-danger/30 bg-danger/10 font-semibold text-danger"
                : isUrgent
                  ? "border-warn/30 bg-warn/15 font-semibold text-warn"
                  : d.status === "done"
                    ? "border-accent/30 bg-accent/15 font-semibold text-accent"
                    : d.status === "in_progress"
                      ? "border-focus/40 bg-focus/10 font-semibold text-focus"
                      : "border-line text-muted bg-surface2"
            }`}
          >
            {isOverdue ? (
              "Overdue"
            ) : isUrgent ? (
              <span className="inline-flex items-center gap-1">
                <AppleEmoji emoji="⚡" size={10} />
                <span>Urgent (&lt;72h)</span>
              </span>
            ) : d.status === "done" ? (
              "✓ Completed"
            ) : (
              STATE_LABEL[d.status]
            )}
          </span>
        </button>
      </div>

      {d.totalCount !== null && (
        <div className="flex items-center gap-3">
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface3">
            <span
              className={`block h-full transition-all duration-300 ease-out rounded-full ${pct === 100 ? "bg-good" : "bg-fg"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="font-mono text-xs text-muted" aria-label={`${countToShow} of ${d.totalCount} done`}>
            {countToShow}/{d.totalCount}
          </span>
          <button
            type="button"
            aria-label={`One fewer done for ${d.name}`}
            disabled={countToShow === 0}
            onClick={() => stepCount(-1)}
            className="size-11 md:size-8 rounded-lg border border-line bg-surface2 text-sm text-fg hover:bg-surface3 transition-all disabled:opacity-20 font-mono flex items-center justify-center active:scale-95 focus-visible:ring-2 focus-visible:ring-focus"
          >
            −
          </button>
          <button
            type="button"
            aria-label={`One more done for ${d.name}`}
            disabled={countToShow === d.totalCount}
            onClick={() => stepCount(1)}
            className="size-11 md:size-8 rounded-lg border border-line bg-surface2 text-sm text-fg hover:bg-surface3 transition-all disabled:opacity-20 font-mono flex items-center justify-center active:scale-95 focus-visible:ring-2 focus-visible:ring-focus"
          >
            +
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {editingDue ? (
          <>
            <input
              type="date"
              aria-label={`Due date for ${d.name}`}
              value={d.due ?? ""}
              onChange={(e) => patch({ due: e.target.value || null })}
              className="h-11 md:h-[38px] rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus"
            />
            <Btn className="px-3 text-xs" onClick={() => setEditingDue(false)}>
              Done
            </Btn>
            {d.due && (
              <Btn kind="ghost" className="px-3 text-xs" onClick={() => patch({ due: null })}>
                Clear
              </Btn>
            )}
          </>
        ) : (
          <Btn className="px-3 text-xs" onClick={() => setEditingDue(true)}>
            {d.due ? `Due ${fmtShort(d.due)}` : "Set due date"}
          </Btn>
        )}

        <button
          type="button"
          aria-pressed={d.vivaPrep}
          onClick={() => patch({ vivaPrep: !d.vivaPrep })}
          className={`min-h-[44px] md:min-h-[38px] rounded-lg border px-3 text-sm font-medium transition-all focus-visible:ring-2 focus-visible:ring-focus ${
            d.vivaPrep ? "border-transparent bg-fg text-bg font-semibold" : "border-line bg-transparent text-muted hover:text-fg"
          }`}
        >
          Viva prep
        </button>
        <a
          href={getDeliverableGCalUrl(d, today)}
          target="_blank"
          rel="noopener noreferrer"
          title="Add Deliverable to Google Calendar"
          aria-label={`Add ${d.name} to Google Calendar`}
          className="min-h-[44px] md:min-h-[38px] rounded-lg border border-line bg-transparent px-3 text-sm text-muted hover:text-fg hover:bg-surface3 transition-all flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-focus"
        >
          <span>📅</span>
          <span>Cal</span>
        </a>
        <Btn kind="ghost" className="ml-auto px-3 text-xs text-muted hover:text-danger" aria-label={`Remove ${d.name}`} onClick={() => setRemoving(true)}>
          Remove
        </Btn>
      </div>

      {removing && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3">
          <span className="text-xs text-danger">Remove "{d.name}"?</span>
          <div className="flex gap-2">
            <Btn kind="outline" onClick={() => setRemoving(false)}>
              Cancel
            </Btn>
            <Btn className="border-0 bg-danger font-semibold text-on-solid hover:opacity-90" onClick={() => act("DELETE", `/api/deliverables/${d.id}`)}>
              Remove
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

function AddForm({ phaseId, act, onDone }: { phaseId: string; act: Act; onDone: () => void }) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const subjectId = `${uid}-subject`;
  const stepsId = `${uid}-steps`;
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [steps, setSteps] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const field = "h-10 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-fg disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-focus transition-all placeholder:text-muted";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const n = name.trim();
    const s = subject.trim();
    if (!n || !s) return;
    busy.current = true;
    setSaving(true);
    try {
      const ok = await act("POST", "/api/deliverables", {
        name: n,
        subject: s,
        phaseId,
        ...(steps ? { totalCount: Number(steps) } : {}),
      });
      if (ok) {
        setName("");
        setSubject("");
        setSteps("");
        onDone();
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-3.5" onSubmit={submit}>
      <label htmlFor={nameId} className="flex flex-col gap-1.5 text-xs font-medium text-fg/80">
        Deliverable Title
        <input id={nameId} value={name} onChange={(e) => setName(e.target.value)} autoFocus disabled={saving} placeholder="e.g. Science Practical Portfolio" className={field} />
      </label>
      <label htmlFor={subjectId} className="flex flex-col gap-1.5 text-xs font-medium text-fg/80">
        Subject
        <input id={subjectId} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Maths / Science" disabled={saving} className={field} />
      </label>
      <label htmlFor={stepsId} className="flex flex-col gap-1.5 text-xs font-medium text-fg/80">
        Steps to Count (Optional)
        <input
          id={stepsId}
          type="number"
          min={1}
          max={100}
          inputMode="numeric"
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          placeholder="e.g. 12 activities"
          disabled={saving}
          className={field}
        />
      </label>
      <div className="flex gap-2.5 pt-1">
        <Btn type="submit" kind="primary" disabled={saving || !name.trim() || !subject.trim()}>
          {saving ? "Adding…" : "Add Deliverable"}
        </Btn>
        <Btn kind="outline" disabled={saving} onClick={onDone}>
          Cancel
        </Btn>
      </div>
    </form>
  );
}
