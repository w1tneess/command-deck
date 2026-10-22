import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCOPES, STATUSES, daysLeft, type Scope, type Status } from "../server/logic.ts";
import { ENERGIES, studyQueue, type Energy } from "../server/planner.ts";
import type { TimerMode } from "../server/timer.ts";
import { AuthError, call, type Chapter, type Phase, type State, type Subject } from "./api.ts";
import { chime, unlockAudio } from "./chime.ts";

const STATUS_LABEL: Record<Status, string> = { not_started: "Not started", learning: "Learning", revised: "Revised", mastered: "Mastered" };
const SCOPE_LABEL: Record<Scope, string> = { term1: "Unit 1/2", pb1: "PB1", pb2: "PB2", board: "Boards" };
const SCOPE_HINT: Record<Scope, string> = { term1: "Unit 1 or 2", pb1: "New in PB1", pb2: "PB2 only", board: "Boards only" };
const PASS_LABEL = ["Concept", "PYQs", "Samples"];
const PASS_TITLE = ["Pass 1: concept mastery", "Pass 2: PYQs and NCERT Exemplar", "Pass 3: sample papers"];
const TABS = ["Today", "Subjects", "Projects", "Week", "Backup"] as const;
type Tab = (typeof TABS)[number];

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const activeOf = (state: State): Phase => state.phases.find((p) => p.id === state.activePhaseId) ?? state.phases[0];

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("Today");
  const [error, setError] = useState("");
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await call<State>("GET", "/api/state"));
      setNeedsLogin(false);
    } catch (e) {
      if (e instanceof AuthError) setNeedsLogin(true);
      else setError("Can't reach the server. Start it with npm start, then reload.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") void load(); };
    const id = setInterval(refresh, 20_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", refresh); };
  }, [load]);

  // One place for every write: send it, show a clear error if it fails, then refresh.
  const act = useCallback(async (method: string, url: string, body?: unknown) => {
    try {
      setError("");
      await call(method, url, body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [load]);

  if (needsLogin) return <PinGate onDone={load} />;
  if (!state) return <main className="shell"><p className="muted">{error || "Loading…"}</p></main>;

  return (
    <main className="shell">
      <header className="top">
        <h1>Study Dashboard</h1>
        <nav aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "tab on" : "tab"} aria-current={t === tab} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      {error && <p role="alert" className="alert">{error}</p>}
      {tab === "Today" && <Today state={state} act={act} reload={load} />}
      {tab === "Subjects" && <Subjects state={state} act={act} />}
      {tab === "Projects" && <Projects state={state} act={act} />}
      {tab === "Week" && <Week state={state} />}
      {tab === "Backup" && <Backup act={act} />}
    </main>
  );
}

type Act = (method: string, url: string, body?: unknown) => Promise<void>;

const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

function PinGate({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, tick] = useState(0);
  const locked = lockedUntil > Date.now();

  // Re-render each second while locked so the countdown (and the unlock) updates.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const submit = useCallback(async (value: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin: value, remember }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; attemptsLeft?: number; retryAfter?: number };
      if (res.ok) return onDone();
      navigator.vibrate?.(80);
      setPin("");
      if (res.status === 429) {
        setLockedUntil(Date.now() + (data.retryAfter ?? 900) * 1000);
        setMsg("");
      } else if (res.status === 401) {
        const left = data.attemptsLeft ?? 0;
        setMsg(`Wrong PIN. ${left} ${left === 1 ? "try" : "tries"} left.`);
      } else {
        setMsg(data.error ?? "Couldn't sign in. Try again.");
      }
    } catch {
      setMsg("Can't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }, [remember, onDone]);

  const press = useCallback((k: string) => {
    if (busy || locked) return;
    setMsg("");
    if (k === "back") return setPin((p) => p.slice(0, -1));
    setPin((p) => {
      if (p.length >= PIN_LENGTH) return p;
      const next = p + k;
      if (next.length === PIN_LENGTH) void submit(next);
      return next;
    });
  }, [busy, locked, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === "Backspace") press("back");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const wait = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
  return (
    <main className="shell narrow gate">
      <h1>Study Dashboard</h1>
      <p className="muted">Enter your PIN.</p>
      <div className="dots" role="img" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={i < pin.length ? "dot-pin on" : "dot-pin"} />)}
      </div>
      <p role="alert" className="gate-msg">
        {locked ? `Too many wrong tries. Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}.` : msg}
      </p>
      <div className="keypad">
        {KEYS.map((k, i) => k === "" ? <span key={i} /> : (
          <button key={k} className="key" disabled={busy || locked} aria-label={k === "back" ? "Delete last digit" : k} onClick={() => press(k)}>
            {k === "back" ? "⌫" : k}
          </button>
        ))}
      </div>
      <label className="check remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember this device for 90 days</span>
      </label>
    </main>
  );
}

/** Study-next order for the active phase, shaped by today's energy check-in. */
function nextUp(state: State, n = 5) {
  const phase = activeOf(state);
  const subj = new Map(state.subjects.map((s) => [s.id, s]));
  const cands = state.subjects.flatMap((s) =>
    s.chapters.map((c) => ({
      chapterId: c.id, subjectId: s.id, priority: s.priority, confidence: c.confidence, lastRevised: c.lastRevised,
      status: c.status, scope: c.scope, examDate: s.examDates[phase.id] ?? null, c,
    })),
  );
  return studyQueue(cands, phase, state.today, state.checkin, n).map((r) => ({ s: subj.get(r.subjectId)!, c: r.c, days: r.days, dated: r.examDate !== null }));
}

function reason(c: Chapter, today: string, days: number, dated: boolean) {
  const since = c.lastRevised ? Math.round((Date.parse(today) - Date.parse(c.lastRevised)) / 86_400_000) : null;
  const rev = since === null ? "never revised" : since === 0 ? "revised today" : `revised ${plural(since, "day")} ago`;
  return `Confidence ${c.confidence}/5, ${rev}${dated ? `, exam ${days === 0 ? "today" : "in " + plural(days, "day")}` : ""}`;
}

const ENERGY_LABEL: Record<Energy, string> = { low: "Low", ok: "OK", high: "High" };
const ENERGY_NOTE: Record<Energy, string> = {
  low: "Low energy: lighter chapters come first.",
  ok: "Normal day: the queue follows your exam dates.",
  high: "High energy: the hardest chapters come first.",
};

function Today({ state, act, reload }: { state: State; act: Act; reload: () => Promise<void> }) {
  const exam = activeOf(state);
  const picks = useMemo(() => nextUp(state), [state]);
  const soon = state.tasks.filter((t) => !t.done && t.due).slice(0, 4);
  const started = exam.daysLeft <= 0;
  const over = state.today > exam.endsOn;
  return (
    <>
      <PhaseSwitcher state={state} act={act} />
      <section className="hero" aria-label="Countdown">
        <div className="count" aria-label={`${exam.daysLeft} days left`}>{Math.max(exam.daysLeft, 0)}</div>
        <div>
          <p className="hero-line">{over ? `${exam.name} is over` : started ? `${exam.name} is on` : `days to ${exam.name}`}</p>
          <p className="muted">
            {fmt(exam.startsOn)} to {fmt(exam.endsOn)}{!exam.confirmed && <span className="tag warn" title="Placeholder dates. Edit them under Subjects when the school posts the datesheet.">approximate</span>}.
            {!over && !started && ` ${plural(exam.studyDaysLeft, "study day")} left after skipping non-study days.`}
          </p>
        </div>
      </section>

      <div className="grid">
        <Targets state={state} act={act} />
        <FocusHub state={state} act={act} reload={reload} />

        <section className="panel">
          <h2>How is your energy?</h2>
          <div className="row" role="group" aria-label="Energy today">
            {ENERGIES.map((e) => (
              <button key={e} className={state.checkin === e ? "seg on" : "seg"} aria-pressed={state.checkin === e} onClick={() => act("POST", "/api/checkin", { energy: e })}>{ENERGY_LABEL[e]}</button>
            ))}
          </div>
          <p className="muted">{state.checkin ? ENERGY_NOTE[state.checkin] : "One tap and today's targets adjust. Skip it and they follow your exam dates."}</p>
        </section>

        <section className="panel">
          <h2>What to study next</h2>
          {picks.length === 0 && <p className="muted">{over ? "This phase is over. Switch phase above to plan the next one." : "Nothing left in scope. Add chapters under Subjects, or switch phase above."}</p>}
          <ol className="plain">
            {picks.map(({ s, c, days, dated }) => (
              <li key={c.id} className="pick">
                <div><strong>{s.name}</strong>: {c.name}<br /><span className="muted">{reason(c, state.today, days, dated)}</span></div>
                <button onClick={() => act("PATCH", `/api/chapters/${c.id}`, { status: "revised" })}>Mark revised</button>
              </li>
            ))}
          </ol>
        </section>

        <ExamDates state={state} />

        <section className="panel">
          <h2>Coming up</h2>
          {soon.length === 0 && <p className="muted">No dated tasks. Add project deadlines under Projects.</p>}
          <ul className="plain">
            {soon.map((t) => <li key={t.id} className="pick"><span>{t.title}</span><DueTag due={t.due!} today={state.today} /></li>)}
          </ul>
        </section>
      </div>
    </>
  );
}

function Targets({ state, act }: { state: State; act: Act }) {
  const [text, setText] = useState("");
  const done = state.targets.filter((t) => t.done).length;
  return (
    <section className="panel">
      <h2>Today's targets{state.targets.length > 0 && <span className="muted count-note">{done} of {state.targets.length} done</span>}</h2>
      {state.targets.length === 0 && <p className="muted">Nothing planned. Add a target below.</p>}
      <ul className="plain">
        {state.targets.map((t) => (
          <li key={t.id} className={t.done ? "pick done" : "pick"}>
            <label className="check">
              <input type="checkbox" checked={t.done} onChange={(e) => act("PATCH", `/api/targets/${t.id}`, { done: e.target.checked })} />
              <span>{t.title}</span>
            </label>
            <span className="row">
              {t.chapterId && !t.done && <button onClick={() => act("POST", `/api/targets/${t.id}/swap`)}>Swap</button>}
              <button aria-label={`Remove ${t.title}`} onClick={() => act("DELETE", `/api/targets/${t.id}`)}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void act("POST", "/api/targets", { title: text }); setText(""); }}>
        <input aria-label="New target" placeholder="Finish the Maths lab file" value={text} onChange={(e) => setText(e.target.value)} />
        <button>Add target</button>
      </form>
    </section>
  );
}

function PhaseSwitcher({ state, act }: { state: State; act: Act }) {
  const active = activeOf(state);
  return (
    <div className="row phase-switch">
      <label className="inline">Phase
        <select value={state.autoPhase ? "auto" : active.id} onChange={(e) => act("PUT", "/api/active-phase", { phaseId: e.target.value === "auto" ? null : e.target.value })}>
          <option value="auto">Auto: {state.phases.find((p) => state.today <= p.endsOn)?.name ?? active.name}</option>
          {state.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <span className="muted">{state.autoPhase ? "Follows the calendar." : "Chosen by you. Pick Auto to follow the calendar."}</span>
    </div>
  );
}

function PhaseEditor({ state, act }: { state: State; act: Act }) {
  return (
    <section className="panel">
      <h2>Exam phases</h2>
      <p className="muted">Pre-Boards 1 dates are from the school calendar. The others are placeholders, so correct them when the datesheets come out and tick Confirmed.</p>
      <ul className="plain">
        {state.phases.map((p) => (
          <li key={p.id} className="phase-row">
            <strong>{p.name}</strong>
            <span className="row">
              <input type="date" aria-label={`${p.name} starts`} value={p.startsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { startsOn: e.target.value })} />
              <span className="muted">to</span>
              <input type="date" aria-label={`${p.name} ends`} value={p.endsOn} onChange={(e) => e.target.value && act("PUT", `/api/phases/${p.id}`, { endsOn: e.target.value })} />
              <label className="check"><input type="checkbox" checked={p.confirmed} onChange={(e) => act("PUT", `/api/phases/${p.id}`, { confirmed: e.target.checked })} /><span>Confirmed</span></label>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DueTag({ due, today }: { due: string; today: string }) {
  const d = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  const cls = d < 0 ? "tag bad" : d <= 3 ? "tag warn" : "tag";
  return <span className={cls}>{d < 0 ? `${plural(-d, "day")} overdue` : d === 0 ? "due today" : `${fmt(due)}, in ${plural(d, "day")}`}</span>;
}

const MODE_LABEL: Record<TimerMode, string> = { idle: "Ready", focus: "Focus", break: "Break", long_break: "Long break" };
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** The timer lives in the cloud: start it on a phone, stop it on a computer. Finished sessions log themselves. */
function FocusHub({ state, act, reload }: { state: State; act: Act; reload: () => Promise<void> }) {
  const timer = state.timer;
  const [subject, setSubject] = useState(() => { try { return localStorage.getItem("focus-subject") ?? "maths"; } catch { return "maths"; } });
  const [note, setNote] = useState("");
  const [, tick] = useState(0);
  const fired = useRef<number | null>(null);
  // Count against the server's clock, so a device with the wrong time still shows the right countdown.
  const skew = useMemo(() => timer.serverNow - Date.now(), [timer.serverNow, timer.endsAt]);
  const running = timer.mode !== "idle" && timer.endsAt !== null;
  const remaining = running ? Math.max(0, Math.ceil((timer.endsAt! - (Date.now() + skew)) / 1000)) : 0;
  const shown = timer.subjectId ?? subject;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [running, timer.endsAt]);

  // When a round ends: chime once, then refresh so the server logs the session and starts the break.
  useEffect(() => {
    if (running && remaining === 0 && fired.current !== timer.endsAt) {
      fired.current = timer.endsAt;
      chime();
      void reload();
    }
  });

  useEffect(() => {
    document.title = running ? `${mmss(remaining)} ${MODE_LABEL[timer.mode]} · Study Dashboard` : "Study Dashboard";
  }, [running, remaining, timer.mode]);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const start = async () => {
    unlockAudio();
    try { localStorage.setItem("focus-subject", subject); } catch { /* optional */ }
    setNote("");
    await act("POST", "/api/timer/start", { subjectId: subject });
  };
  const stop = async () => {
    try {
      const r = await call<{ logged: number }>("POST", "/api/timer/stop");
      setNote(timer.mode === "focus" ? (r.logged ? `Logged ${plural(r.logged, "minute")}.` : "Stopped. Under a minute, so nothing was logged.") : "");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't stop the timer.");
    }
    await reload();
  };

  const rounds = timer.mode === "long_break" ? 4 : timer.round;
  return (
    <section className="panel">
      <h2>Focus timer</h2>
      {!running ? (
        <>
          <label>Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <button className="primary" onClick={start}>Start 25 minutes</button>
          <p className="muted">Round {Math.min(timer.round + 1, 4)} of 4, then a longer break. Time is logged for you.</p>
        </>
      ) : (
        <>
          <div className="clock" role="timer" aria-label={`${MODE_LABEL[timer.mode]}, ${mmss(remaining)} left`}>{mmss(remaining)}</div>
          <p className="muted">{MODE_LABEL[timer.mode]}{timer.mode === "focus" && `: ${state.subjects.find((s) => s.id === shown)?.name ?? ""}`}</p>
          <div className="rounds" role="img" aria-label={`${rounds} of 4 rounds done`}>
            {[0, 1, 2, 3].map((i) => <span key={i} className={i < rounds ? "dot-pin on" : "dot-pin"} />)}
          </div>
          <button onClick={stop}>{timer.mode === "focus" ? "Stop and log time so far" : "Skip break"}</button>
        </>
      )}
      {note && <p role="status" className="muted">{note}</p>}
    </section>
  );
}

function Subjects({ state, act }: { state: State; act: Act }) {
  const [open, setOpen] = useState<string | null>("maths");
  return (
    <div className="stack">
      <PhaseEditor state={state} act={act} />
      {state.subjects.map((s) => (
        <section key={s.id} className="panel">
          <button className="subject-head" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="name">{s.name}</span>
            <span className="bar" role="progressbar" aria-valuenow={s.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} progress`}>
              <span style={{ width: `${s.progressPct}%` }} />
            </span>
            <span className="pct">{s.progressPct}%</span>
          </button>
          {open === s.id && <SubjectBody s={s} phase={activeOf(state)} act={act} />}
        </section>
      ))}
    </div>
  );
}

function SubjectBody({ s, phase, act }: { s: Subject; phase: Phase; act: Act }) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("term1");
  return (
    <div className="body">
      <label className="inline">Exam date for {phase.name}
        <input type="date" value={s.examDates[phase.id] ?? ""} onChange={(e) => act("PUT", `/api/subjects/${s.id}/exam-date`, { phaseId: phase.id, date: e.target.value || null })} />
      </label>
      {s.chapters.length === 0 && <p className="muted">No chapters yet. Add them from the school syllabus below.</p>}
      <ul className="plain">
        {s.chapters.map((c) => (
          <li key={c.id} className="chapter">
            <div className="ch-name">
              {c.name}
              {!c.confirmed && <span className="tag warn" title={c.source ?? "Not checked against the school syllabus yet"}>unchecked</span>}
            </div>
            <div className="row" role="group" aria-label={`Status of ${c.name}`}>
              {STATUSES.map((st) => (
                <button key={st} className={`seg ${st} ${c.status === st ? "on" : ""}`} aria-pressed={c.status === st}
                  onClick={() => act("PATCH", `/api/chapters/${c.id}`, { status: st })}>{STATUS_LABEL[st]}</button>
              ))}
            </div>
            <div className="row" role="group" aria-label={`Revision passes for ${c.name}`}>
              <span className="muted">Passes</span>
              {PASS_LABEL.map((label, i) => (
                <button key={label} className={c.passes[i] ? "seg on pass" : "seg"} aria-pressed={!!c.passes[i]} title={c.passes[i] ? `${PASS_TITLE[i]}, done ${fmt(c.passes[i]!)}` : PASS_TITLE[i]}
                  onClick={() => act("PUT", `/api/chapters/${c.id}/passes/${i + 1}`, { done: !c.passes[i] })}>{label}</button>
              ))}
              <select className="scope-select" aria-label={`Scope of ${c.name}`} value={c.scope} onChange={(e) => act("PATCH", `/api/chapters/${c.id}/meta`, { scope: e.target.value })}>
                {SCOPES.map((sc) => <option key={sc} value={sc}>{SCOPE_LABEL[sc]}</option>)}
              </select>
            </div>
            <div className="row" role="group" aria-label={`Confidence in ${c.name}`}>
              <span className="muted">Confidence</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={n <= c.confidence ? "dot on" : "dot"} aria-label={`${n} of 5`} aria-pressed={n === c.confidence}
                  onClick={() => act("PATCH", `/api/chapters/${c.id}`, { confidence: n })}>{n}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; void act("POST", "/api/chapters", { subjectId: s.id, name, scope }); setName(""); }}>
        <input aria-label={`New ${s.name} chapter`} placeholder="Add a chapter" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="When it is first tested" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
          {SCOPES.map((sc) => <option key={sc} value={sc}>{SCOPE_HINT[sc]}</option>)}
        </select>
        <button>Add chapter</button>
      </form>
    </div>
  );
}

function Projects({ state, act }: { state: State; act: Act }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("project");
  const [due, setDue] = useState("");
  const name = (id: string | null) => state.subjects.find((s) => s.id === id)?.name;
  return (
    <section className="panel">
      <h2>Projects, practicals and tasks</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; void act("POST", "/api/tasks", { title, kind, due: due || null }); setTitle(""); setDue(""); }}>
        <input aria-label="Title" placeholder="Maths portfolio, activity 3" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="project">Project</option><option value="practical">Practical</option><option value="viva">Viva</option><option value="task">Task</option>
        </select>
        <input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        <button className="primary">Add</button>
      </form>
      {state.tasks.length === 0 && <p className="muted">Nothing here yet. Add the PB1 submissions: portfolios, projects, viva prep.</p>}
      <ul className="plain">
        {state.tasks.map((t) => (
          <li key={t.id} className={t.done ? "pick done" : "pick"}>
            <label className="check">
              <input type="checkbox" checked={t.done} onChange={(e) => act("PATCH", `/api/tasks/${t.id}`, { done: e.target.checked })} />
              <span>{t.title} <span className="muted">{t.kind}{name(t.subjectId) ? `, ${name(t.subjectId)}` : ""}</span></span>
            </label>
            <span className="row">
              {t.due && !t.done && <DueTag due={t.due} today={state.today} />}
              <button aria-label={`Delete ${t.title}`} onClick={() => act("DELETE", `/api/tasks/${t.id}`)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Week({ state }: { state: State }) {
  const days = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(state.today) - (6 - i) * 86_400_000).toISOString().slice(0, 10));
  const byDay = days.map((d) => state.sessions.filter((s) => s.day === d).reduce((a, s) => a + s.minutes, 0));
  const max = Math.max(60, ...byDay);
  const bySubject = new Map<string, number>();
  state.sessions.forEach((s) => bySubject.set(s.subjectId, (bySubject.get(s.subjectId) ?? 0) + s.minutes));
  const total = byDay.reduce((a, b) => a + b, 0);
  const weekday = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  return (
    <div className="stack">
      <section className="panel">
        <h2>This week: {(total / 60).toFixed(1)} hours</h2>
        <div className="bars" role="img" aria-label={`Minutes studied per day: ${byDay.join(", ")}`}>
          {days.map((d, i) => (
            <div key={d} className="col">
              <span className="mins">{byDay[i] || ""}</span>
              <span className="barv" style={{ height: `${(byDay[i] / max) * 100}%` }} />
              <span className="muted">{weekday(d)}</span>
            </div>
          ))}
        </div>
        {total === 0 ? <p className="muted">No sessions yet. Run the focus timer on the Today tab and the time lands here.</p> : (
          <ul className="plain">
            {[...bySubject].sort((a, b) => b[1] - a[1]).map(([id, m]) => (
              <li key={id} className="pick"><span>{state.subjects.find((s) => s.id === id)?.name ?? id}</span><span>{m} min</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>Energy and study time</h2>
        <ul className="plain">
          {days.map((d, i) => {
            const e = state.checkins.find((c) => c.day === d)?.energy;
            return (
              <li key={d} className="pick">
                <span>{weekday(d)}, {fmt(d)}</span>
                <span className="row"><span className={e ? `tag energy-${e}` : "tag"}>{e ? ENERGY_LABEL[e] : "no check-in"}</span><span>{byDay[i]} min</span></span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function ExamDates({ state }: { state: State }) {
  const phase = activeOf(state);
  const dated = state.subjects.filter((s) => s.examDates[phase.id]).sort((a, b) => a.examDates[phase.id].localeCompare(b.examDates[phase.id]));
  return (
    <section className="panel">
      <h2>Subject exam dates</h2>
      {dated.length === 0 && <p className="muted">Not set for {phase.name}. When the school posts the datesheet, enter each date under Subjects and the study list re-orders itself.</p>}
      <ul className="plain">
        {dated.map((s) => {
          const date = s.examDates[phase.id];
          const d = daysLeft(date, state.today);
          return <li key={s.id} className="pick"><span>{s.name}</span><span className={d < 0 ? "tag bad" : d <= 3 ? "tag warn" : "tag"}>{d < 0 ? "done" : d === 0 ? "today" : `${fmt(date)}, in ${plural(d, "day")}`}</span></li>;
        })}
      </ul>
    </section>
  );
}

function Backup({ act }: { act: Act }) {
  const [msg, setMsg] = useState("");
  const download = async () => {
    try {
      const data = await call("GET", "/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `exam-tracker-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      try { localStorage.setItem("last-backup", new Date().toISOString()); } catch { /* optional */ }
      setMsg("Backup downloaded.");
    } catch { setMsg("Couldn't create the backup. Is the server running?"); }
  };
  const restore = async (file: File | undefined) => {
    if (!file) return;
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { setMsg("That file isn't valid JSON, so nothing was changed."); return; }
    if (!confirm("Restoring replaces everything in the app with this backup. Continue?")) return;
    try { await call("POST", "/api/import", data); await act("GET", "/api/state"); setMsg("Restored from backup."); }
    catch (e) { setMsg(`${e instanceof Error ? e.message : "Restore failed."} Nothing was changed.`); }
  };
  let last = "";
  try { last = localStorage.getItem("last-backup") ?? ""; } catch { /* optional */ }
  return (
    <section className="panel">
      <h2>Backup and restore</h2>
      <p>Your progress lives in the server's database. Download a copy now and then, and before moving to another computer.</p>
      <p className="muted">{last ? `Last backup from this browser: ${new Date(last).toLocaleString("en-IN")}.` : "No backup made from this browser yet."}</p>
      <div className="row">
        <button className="primary" onClick={download}>Download backup</button>
        <label className="filebtn">Restore from file<input type="file" accept="application/json,.json" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      {msg && <p role="status" className="muted">{msg}</p>}
      <h2 className="spaced">This device</h2>
      <div className="row">
        <button onClick={() => signOut("/api/logout")}>Sign out</button>
        <button onClick={() => { if (confirm("Sign out of every phone and computer, including this one?")) void signOut("/api/logout-all"); }}>Sign out of all devices</button>
      </div>
    </section>
  );
}

/** Ends the session on the server, then wipes the offline copy so a shared device keeps no study data. */
async function signOut(url: string) {
  await call("POST", url).catch(() => undefined);
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  location.reload();
}
