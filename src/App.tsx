import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUSES, daysLeft, inScope, rankNext, type Status } from "../server/logic.ts";
import { AuthError, call, getToken, setToken, type Chapter, type State, type Subject } from "./api.ts";

const STATUS_LABEL: Record<Status, string> = { not_started: "Not started", learning: "Learning", revised: "Revised", mastered: "Mastered" };
const TABS = ["Today", "Subjects", "Projects", "Week", "Backup"] as const;
type Tab = (typeof TABS)[number];

const fmt = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function App() {
  const [state, setState] = useState<State | null>(null);
  const [tab, setTab] = useState<Tab>("Today");
  const [error, setError] = useState("");
  const [needsToken, setNeedsToken] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await call<State>("GET", "/api/state"));
      setNeedsToken(false);
    } catch (e) {
      if (e instanceof AuthError) setNeedsToken(true);
      else setError("Can't reach the server. Start it with npm start, then reload.");
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

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

  if (needsToken) return <TokenGate onDone={load} />;
  if (!state) return <main className="shell"><p className="muted">{error || "Loading…"}</p></main>;

  return (
    <main className="shell">
      <header className="top">
        <h1>Exam Tracker</h1>
        <nav aria-label="Sections">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? "tab on" : "tab"} aria-current={t === tab} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
      </header>
      {error && <p role="alert" className="alert">{error}</p>}
      {tab === "Today" && <Today state={state} act={act} />}
      {tab === "Subjects" && <Subjects state={state} act={act} />}
      {tab === "Projects" && <Projects state={state} act={act} />}
      {tab === "Week" && <Week state={state} />}
      {tab === "Backup" && <Backup act={act} />}
    </main>
  );
}

type Act = (method: string, url: string, body?: unknown) => Promise<void>;

function TokenGate({ onDone }: { onDone: () => void }) {
  const [v, setV] = useState("");
  return (
    <main className="shell narrow">
      <h1>Exam Tracker</h1>
      <p>This app is private. Enter your access token to continue.</p>
      {getToken() && <p role="alert" className="alert">That token was rejected. Check it and try again.</p>}
      <form onSubmit={(e) => { e.preventDefault(); setToken(v.trim()); onDone(); }} className="row">
        <input aria-label="Access token" type="password" value={v} onChange={(e) => setV(e.target.value)} />
        <button className="primary">Unlock</button>
      </form>
    </main>
  );
}

/** Study-next order from rankNext: weak chapters in subjects with the nearest exam come first. */
function nextUp(state: State, n = 5) {
  const subj = new Map(state.subjects.map((s) => [s.id, s]));
  const cands = state.subjects.flatMap((s) =>
    s.chapters
      .filter((c) => c.status !== "mastered" && inScope(c.introducedIn, "pb1"))
      .map((c) => ({ chapterId: c.id, subjectId: s.id, priority: s.priority, confidence: c.confidence, lastRevised: c.lastRevised, examDate: s.examDate, c })),
  );
  return rankNext(cands, state.today, state.exams[0].start, n).map((r) => ({ s: subj.get(r.subjectId)!, c: r.c, days: r.days, dated: r.examDate !== null }));
}

function reason(c: Chapter, today: string, days: number, dated: boolean) {
  const since = c.lastRevised ? Math.round((Date.parse(today) - Date.parse(c.lastRevised)) / 86_400_000) : null;
  const rev = since === null ? "never revised" : since === 0 ? "revised today" : `revised ${plural(since, "day")} ago`;
  return `Confidence ${c.confidence}/5, ${rev}${dated ? `, exam ${days === 0 ? "today" : "in " + plural(days, "day")}` : ""}`;
}

function Today({ state, act }: { state: State; act: Act }) {
  const exam = state.exams[0];
  const picks = useMemo(() => nextUp(state), [state]);
  const soon = state.tasks.filter((t) => !t.done && t.due).slice(0, 4);
  const started = exam.daysLeft <= 0;
  return (
    <>
      <section className="hero" aria-label="Countdown">
        <div className="count" aria-label={`${exam.daysLeft} days left`}>{Math.max(exam.daysLeft, 0)}</div>
        <div>
          <p className="hero-line">{started ? `${exam.name} is on` : `days to ${exam.name}`}</p>
          <p className="muted">{fmt(exam.start)} to {fmt(exam.end)}. {plural(exam.studyDaysLeft, "study day")} left after skipping non-study days.</p>
        </div>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>What to study next</h2>
          {picks.length === 0 && <p className="muted">Nothing left in scope. Add chapters under Subjects.</p>}
          <ol className="plain">
            {picks.map(({ s, c, days, dated }) => (
              <li key={c.id} className="pick">
                <div><strong>{s.name}</strong>: {c.name}<br /><span className="muted">{reason(c, state.today, days, dated)}</span></div>
                <button onClick={() => act("PATCH", `/api/chapters/${c.id}`, { status: "revised" })}>Mark revised</button>
              </li>
            ))}
          </ol>
        </section>

        <Focus state={state} act={act} />

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

function DueTag({ due, today }: { due: string; today: string }) {
  const d = Math.round((Date.parse(due) - Date.parse(today)) / 86_400_000);
  const cls = d < 0 ? "tag bad" : d <= 3 ? "tag warn" : "tag";
  return <span className={cls}>{d < 0 ? `${plural(-d, "day")} overdue` : d === 0 ? "due today" : `${fmt(due)}, in ${plural(d, "day")}`}</span>;
}

function Focus({ state, act }: { state: State; act: Act }) {
  const [subject, setSubject] = useState("maths");
  const [mins, setMins] = useState(25);
  const [left, setLeft] = useState<number | null>(null);
  const endAt = useRef(0);
  const ran = useRef(0);

  useEffect(() => {
    if (left === null) return;
    // Count against the wall clock, so a throttled background tab can't stretch the session.
    const id = setInterval(() => {
      const rem = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      if (rem === 0) {
        clearInterval(id);
        setLeft(null);
        void act("POST", "/api/sessions", { subjectId: subject, minutes: ran.current });
      } else setLeft(rem);
    }, 500);
    return () => clearInterval(id);
  }, [left === null, subject, act]);

  const start = () => { ran.current = mins; endAt.current = Date.now() + mins * 60_000; setLeft(mins * 60); };
  const stopEarly = () => {
    const done = Math.floor((ran.current * 60 - (endAt.current - Date.now()) / 1000) / 60);
    setLeft(null);
    if (done >= 1) void act("POST", "/api/sessions", { subjectId: subject, minutes: done });
  };

  return (
    <section className="panel">
      <h2>Focus timer</h2>
      {left === null ? (
        <>
          <label>Subject
            <select value={subject} onChange={(e) => setSubject(e.target.value)}>
              {state.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="row" role="group" aria-label="Length">
            {[25, 45, 60].map((m) => <button key={m} className={m === mins ? "seg on" : "seg"} onClick={() => setMins(m)}>{m} min</button>)}
          </div>
          <button className="primary" onClick={start}>Start {mins} minutes</button>
        </>
      ) : (
        <>
          <div className="clock" role="timer">{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</div>
          <p className="muted">{state.subjects.find((s) => s.id === subject)?.name}</p>
          <button onClick={stopEarly}>Stop and log time so far</button>
        </>
      )}
    </section>
  );
}

function Subjects({ state, act }: { state: State; act: Act }) {
  const [open, setOpen] = useState<string | null>("maths");
  return (
    <div className="stack">
      {state.subjects.map((s) => (
        <section key={s.id} className="panel">
          <button className="subject-head" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
            <span className="name">{s.name}</span>
            <span className="bar" role="progressbar" aria-valuenow={s.progressPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${s.name} progress`}>
              <span style={{ width: `${s.progressPct}%` }} />
            </span>
            <span className="pct">{s.progressPct}%</span>
          </button>
          {open === s.id && <SubjectBody s={s} act={act} />}
        </section>
      ))}
    </div>
  );
}

function SubjectBody({ s, act }: { s: Subject; act: Act }) {
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("earlier");
  return (
    <div className="body">
      <label className="inline">Exam date
        <input type="date" value={s.examDate ?? ""} onChange={(e) => act("PUT", `/api/subjects/${s.id}/exam-date`, { date: e.target.value || null })} />
      </label>
      {s.chapters.length === 0 && <p className="muted">No chapters yet. Add them from the school syllabus below.</p>}
      <ul className="plain">
        {s.chapters.map((c) => (
          <li key={c.id} className="chapter">
            <div className="ch-name">
              {c.name}
              {c.introducedIn !== "earlier" && <span className="tag">{c.introducedIn === "pb1" ? "new in PB1" : "PB2 only"}</span>}
              {!c.confirmed && <span className="tag warn" title={c.source ?? "Not checked against the school syllabus yet"}>unchecked</span>}
            </div>
            <div className="row" role="group" aria-label={`Status of ${c.name}`}>
              {STATUSES.map((st) => (
                <button key={st} className={`seg ${st} ${c.status === st ? "on" : ""}`} aria-pressed={c.status === st}
                  onClick={() => act("PATCH", `/api/chapters/${c.id}`, { status: st })}>{STATUS_LABEL[st]}</button>
              ))}
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
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; void act("POST", "/api/chapters", { subjectId: s.id, name, introducedIn: intro }); setName(""); }}>
        <input aria-label={`New ${s.name} chapter`} placeholder="Add a chapter" value={name} onChange={(e) => setName(e.target.value)} />
        <select aria-label="When it is first tested" value={intro} onChange={(e) => setIntro(e.target.value)}>
          <option value="earlier">Unit 1 or 2</option><option value="pb1">New in PB1</option><option value="pb2">PB2 only</option>
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
  return (
    <section className="panel">
      <h2>This week: {(total / 60).toFixed(1)} hours</h2>
      <div className="bars" role="img" aria-label={`Minutes studied per day: ${byDay.join(", ")}`}>
        {days.map((d, i) => (
          <div key={d} className="col">
            <span className="mins">{byDay[i] || ""}</span>
            <span className="barv" style={{ height: `${(byDay[i] / max) * 100}%` }} />
            <span className="muted">{new Date(d + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span>
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
  );
}

function ExamDates({ state }: { state: State }) {
  const dated = state.subjects.filter((s) => s.examDate).sort((a, b) => a.examDate!.localeCompare(b.examDate!));
  return (
    <section className="panel">
      <h2>Subject exam dates</h2>
      {dated.length === 0 && <p className="muted">Not set yet. When the school posts the datesheet, enter each date under Subjects and the study list re-orders itself.</p>}
      <ul className="plain">
        {dated.map((s) => {
          const d = daysLeft(s.examDate!, state.today);
          return <li key={s.id} className="pick"><span>{s.name}</span><span className={d < 0 ? "tag bad" : d <= 3 ? "tag warn" : "tag"}>{d < 0 ? "done" : d === 0 ? "today" : `${fmt(s.examDate!)}, in ${plural(d, "day")}`}</span></li>;
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
    </section>
  );
}
