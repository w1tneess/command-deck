import { useId, useRef, useState } from "react";
import type { Act, Chapter, State, Subject } from "./api.ts";
import { type FocusModel } from "./Focus.tsx";
import { AppleEmoji, AppleText, Check, ICONS, Icon, plural } from "./ui.tsx";
import { studyQueueFor, reasonFor, computeChapterDuration, activeOf } from "./model.ts";
import { guessSubject, addDaysToToday } from "./Capture.tsx";
import { getTargetGCalUrl, getDeliverableGCalUrl, formatIstEventTime } from "./calendar-utils.ts";
import { CalendarModal } from "./CalendarModal.tsx";

interface TodayProps {
  state: State;
  act: Act;
  focus: FocusModel;
  onOpenZen?: () => void;
  onOpenViva?: (chapter: Chapter, subject: Subject) => void;
  onOpenCommandBar?: () => void;
}

const SUBJECT_COLORS: Record<string, string> = {
  science: "#38bdf8",
  physics: "#38bdf8",
  chemistry: "#facc15",
  biology: "#2dd4bf",
  maths: "#f87171",
  social: "#fb923c",
  english: "#60a5fa",
  bengali: "#c084fc",
  it: "#e879f9",
};

const ROUTINE_BLOCKS = [
  { time: "05:30", label: "Wake up + Freshen up" },
  { time: "06:00", label: "Study (Deep Focus)" },
  { time: "08:45 - 14:30", label: "School Hours" },
  { time: "14:30", label: "Lunch + Rest" },
  { time: "15:30 - 17:00", label: "Afternoon Study Slot" },
  { time: "17:30 - 19:30", label: "Tuition / Evening Study" },
  { time: "20:00", label: "Dinner + Family" },
  { time: "21:00", label: "Wind Down / Revision" },
  { time: "22:30", label: "Sleep" },
];

export function Today({ state, act, onOpenViva }: TodayProps) {
  const activePhase = activeOf(state);

  // IST Date & Greeting
  const istHour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(
      new Date()
    )
  );
  const greeting =
    istHour < 12 ? "Good morning, Advaita" : istHour < 17 ? "Good afternoon, Advaita" : "Good evening, Advaita";

  const todayISTFormatted = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());

  // 1. Study Queue (Top 5 Priority)
  const topQueue = studyQueueFor(state, 5);

  // Calendar Modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false);

  // 2. Add Target Form State
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDuration, setNewTaskDuration] = useState("45m");
  const newTaskInputId = useId();
  const addTaskBusy = useRef(false);

  // 3. Quick Capture State
  const [captureText, setCaptureText] = useState("");
  const [activeDoubtId, setActiveDoubtId] = useState<number | null>(null);
  const captureBusy = useRef(false);
  const captureInputId = useId();

  // 4. Metrics
  const todayMins = state.sessions
    .filter((s) => s.day === state.today)
    .reduce((acc, s) => acc + s.minutes, 0);
  const studyTimeFormatted = `${Math.floor(todayMins / 60)}h ${todayMins % 60}m`;
  const completedTargetsCount = state.targets.filter((t) => t.done).length;

  // Target Actions
  const handleToggleTarget = async (id: number, currentDone: boolean) => {
    await act("PATCH", `/api/targets/${id}`, { done: !currentDone });
  };

  const handleDeleteTarget = async (id: number) => {
    await act("DELETE", `/api/targets/${id}`);
  };

  const handleAddTask = async () => {
    if (addTaskBusy.current) return;
    const title = newTaskTitle.trim();
    if (!title) {
      setIsAddingTask(false);
      return;
    }
    addTaskBusy.current = true;
    try {
      await act("POST", "/api/targets", { title, duration: newTaskDuration });
      setNewTaskTitle("");
      setIsAddingTask(false);
    } finally {
      addTaskBusy.current = false;
    }
  };

  const handleAddQueueChapter = async (q: typeof topQueue[0]) => {
    if (addTaskBusy.current) return;
    addTaskBusy.current = true;
    try {
      const duration = computeChapterDuration(q.confidence, q.subjectId);
      await act("POST", "/api/targets", {
        chapterId: q.chapterId,
        subjectId: q.subjectId,
        duration,
        title: `${q.subject.name}: ${q.chapter.name}`,
      });
    } finally {
      addTaskBusy.current = false;
    }
  };

  // Habit Actions
  const handleToggleHabit = async (habitId: number, currentToday: number, goal: number) => {
    const nextVal = currentToday >= goal ? 0 : goal;
    await act("POST", "/api/habit-entry", { habitId, day: state.today, value: nextVal });
  };

  const habitsDoneCount = state.habits.filter((h) => h.today >= h.goal).length;

  // Capture Actions
  const handleSaveCapture = async () => {
    const text = captureText.trim();
    if (!text || captureBusy.current) return;
    captureBusy.current = true;
    try {
      await act("POST", "/api/captures", { text, kind: "todo" });
      setCaptureText("");
    } finally {
      captureBusy.current = false;
    }
  };

  const convertCaptureToTask = async (c: State["captures"][0]) => {
    if (captureBusy.current) return;
    captureBusy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      await act("POST", "/api/targets", { title: clean || c.text, duration: "45m" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      captureBusy.current = false;
    }
  };

  const convertCaptureToDeliverable = async (c: State["captures"][0]) => {
    if (captureBusy.current) return;
    captureBusy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      const sub = guessSubject(c.text, state.subjects);
      const due = addDaysToToday(state.today, 3);
      await act("POST", "/api/deliverables", { name: clean || c.text, subject: sub, due, detail: "Captured from Inbox" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      captureBusy.current = false;
    }
  };

  // Deliverables: compute overdue and days left
  const getDeliverableDaysLeft = (due: string | null): number | null => {
    if (!due) return null;
    const dueMs = Date.parse(due + "T00:00:00Z");
    const todayMs = Date.parse(state.today + "T00:00:00Z");
    return Math.round((dueMs - todayMs) / (1000 * 60 * 60 * 24));
  };

  const sortedDeliverables = [...state.deliverables].sort((a, b) => {
    if (a.status === "done" && b.status !== "done") return 1;
    if (b.status === "done" && a.status !== "done") return -1;
    const aDays = getDeliverableDaysLeft(a.due);
    const bDays = getDeliverableDaysLeft(b.due);
    if (aDays !== null && bDays !== null) return aDays - bDays;
    if (aDays !== null) return -1;
    if (bDays !== null) return 1;
    return 0;
  });

  const overdueDeliverables = sortedDeliverables.filter(
    (d) => d.status !== "done" && d.due && d.due < state.today
  );

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1440px] mx-auto animate-fade-in text-zinc-100 pb-16">
      {/* ========================================================================= */}
      {/* 1. ATMOSPHERIC HERO BANNER (Single clean headline, zero duplicate quotes)   */}
      {/* ========================================================================= */}
      <section
        aria-label="Daily Overview"
        className="relative overflow-hidden rounded-2xl border border-line-strong px-6 py-5 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          backgroundImage: "url('/hero-mountains.jpg')",
          backgroundPosition: "center 35%",
          backgroundSize: "cover",
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-bg/95 via-bg/80 to-bg/40 z-0" />

        <div className="relative z-10">
          <p className="m-0 text-sm font-medium text-muted">{greeting}</p>
          <h1 className="m-0 mt-0.5 font-serif text-2xl sm:text-3xl font-normal text-fg leading-tight tracking-tight">
            Same mind. Bigger plans.
          </h1>
        </div>

        <dl className="relative z-10 m-0 flex gap-3">
          <div className="rounded-xl border border-line-strong bg-surface/85 backdrop-blur-md px-4 py-2">
            <dt className="text-xs text-muted">{activePhase.name}</dt>
            <dd className="m-0 font-mono text-sm font-semibold text-fg">
              {activePhase.daysLeft > 0 ? `${activePhase.daysLeft} days to go` : "Under way"}
            </dd>
          </div>
          <div className="rounded-xl border border-line-strong bg-surface/85 backdrop-blur-md px-4 py-2">
            <dt className="text-xs text-muted">Studied today</dt>
            <dd className="m-0 font-mono text-sm font-semibold text-fg">{studyTimeFormatted}</dd>
          </div>
        </dl>
      </section>

      {/* ========================================================================= */}
      {/* 2. ONE PRIMARY PANEL + FOCUSED SECONDARY COMPANIONS                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ----------------------------------------------------------------------- */}
        {/* PRIMARY PANEL (7 Cols on desktop): The Daily Focus & Execution Cockpit   */}
        {/* Combines Today's Targets + Live Study Queue into One Seamless Center    */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <section
            aria-labelledby="primary-cockpit-h"
            className="rounded-3xl bg-surface border border-white/[0.08] hover:border-white/[0.14] p-6 sm:p-7 shadow-sm flex flex-col gap-6 transition-all"
          >
            {/* Primary Panel Header */}
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-xl bg-sky-500/10 text-sky-400">
                  <AppleEmoji emoji="🎯" size={18} />
                </span>
                <div>
                  <h2 id="primary-cockpit-h" className="font-sans font-bold text-lg text-white">
                    Today's targets
                  </h2>
                  <p className="m-0 text-xs text-zinc-400 mt-0.5">
                    What to study today, in order
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-zinc-300 bg-white/[0.04] border border-white/10 px-2.5 py-1 rounded-lg">
                  {completedTargetsCount}/{state.targets.length} Done
                </span>
              </div>
            </div>

            {/* Target Items Checklist */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Active Focus Targets
                </span>
                {state.targets.length > 0 && (
                  <span className="text-xs font-mono text-zinc-500">
                    Auto-scheduled avoiding school & tuition
                  </span>
                )}
              </div>

              {state.targets.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/[0.1] bg-white/[0.01] p-6 text-center">
                  <p className="m-0 text-xs text-zinc-400">
                    No targets scheduled yet for today.
                  </p>
                  <p className="m-0 text-xs text-zinc-500 mt-1">
                    Select a high-yield chapter from the recommended queue below, or add a custom task.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {state.targets.map((task) => {
                    const chapter = task.chapterId ? state.subjects.flatMap((s) => s.chapters).find((c) => c.id === task.chapterId) : null;
                    const taskDur = task.duration || (chapter ? computeChapterDuration(chapter.confidence, task.subjectId ?? undefined) : "45m");
                    return (
                      <div
                        key={task.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-bg/70 border border-white/[0.06] hover:border-white/[0.14] transition-all group"
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleTarget(task.id, task.done)}
                          aria-label={`Toggle target ${task.title}`}
                          className="flex items-center gap-3 min-w-0 flex-1 text-left bg-transparent border-0 p-0 cursor-pointer"
                        >
                          <Check on={task.done} />
                          <span
                            className={`text-xs sm:text-[13px] font-sans font-medium tracking-wide sm:truncate ${
                              task.done ? "text-zinc-500 line-through" : "text-zinc-100 group-hover:text-white"
                            }`}
                          >
                            <AppleText text={task.title} size={14} />
                          </span>
                        </button>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-xs text-zinc-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md tabular-nums">
                            {taskDur}
                          </span>
                          <a
                            href={getTargetGCalUrl(task, state.today, {
                              externalEvents: state.externalEvents,
                              otherTargets: state.targets,
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Add target ${task.title} to Google Calendar`}
                            title="Add target to Google Calendar (respects tuition and school)"
                            className="text-zinc-400 hover:text-sky-400 p-1.5 rounded-lg hover:bg-white/[0.06] transition-all flex items-center cursor-pointer"
                          >
                            <AppleEmoji emoji="📅" size={13} />
                          </a>
                          <button
                            type="button"
                            aria-label={`Delete target ${task.title}`}
                            onClick={() => handleDeleteTarget(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 font-mono text-xs p-1 transition-all cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add Custom Task Form */}
              {isAddingTask ? (
                <div className="flex flex-col gap-2.5 pt-3 border-t border-white/[0.06]">
                  <label htmlFor={newTaskInputId} className="sr-only">Task title</label>
                  <input
                    id={newTaskInputId}
                    type="text"
                    autoFocus
                    placeholder="Enter custom study target or revision topic..."
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddTask();
                      if (e.key === "Escape") setIsAddingTask(false);
                    }}
                    className="w-full rounded-xl border border-white/[0.12] bg-bg px-3.5 py-2.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400 transition-all"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-sans text-zinc-400">Duration:</span>
                      <select
                        aria-label="Task duration"
                        value={newTaskDuration}
                        onChange={(e) => setNewTaskDuration(e.target.value)}
                        className="rounded-lg border border-white/[0.1] bg-bg px-2.5 py-1 text-xs text-zinc-200 focus:outline-none"
                      >
                        <option value="30m">30m</option>
                        <option value="45m">45m</option>
                        <option value="50m">50m</option>
                        <option value="1h 00m">1h 00m</option>
                        <option value="1h 15m">1h 15m</option>
                        <option value="1h 30m">1h 30m</option>
                        <option value="2h 00m">2h 00m</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsAddingTask(false)}
                        className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-white transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddTask}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-on-solid font-semibold text-xs shadow-md active:scale-95 transition-all cursor-pointer"
                      >
                        Add Target
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setIsAddingTask(true)}
                    className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-emerald-400 font-sans transition-all cursor-pointer py-1"
                  >
                    <span className="text-sm font-bold">+</span>
                    <span>Add custom target</span>
                  </button>
                </div>
              )}
            </div>

            {/* Recommended Study Queue Integrated Into Primary Cockpit */}
            <div className="flex flex-col gap-3 pt-5 border-t border-white/[0.08]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-md bg-amber-500/10 text-amber-400">
                    <AppleEmoji emoji="⚡" size={13} />
                  </span>
                  <span className="font-sans text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    Up next
                  </span>
                </div>
                <span className="font-mono text-xs text-zinc-500">
                  {topQueue.length} priority chapters
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {topQueue.length === 0 ? (
                  <div className="text-xs text-zinc-500 py-3 text-center">
                    All active phase syllabus chapters are currently mastered!
                  </div>
                ) : (
                  topQueue.map((q) => {
                    const inToday = state.targets.some((t) => t.chapterId === q.chapterId);
                    const durationEst = computeChapterDuration(q.confidence, q.subjectId);
                    const subColor = SUBJECT_COLORS[q.subjectId] || "#38bdf8";

                    return (
                      <div
                        key={q.chapterId}
                        className="flex flex-col gap-2 rounded-2xl border border-white/[0.05] bg-bg/50 p-3.5 hover:border-white/[0.12] transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="size-2 rounded-full shrink-0"
                                style={{ backgroundColor: subColor }}
                              />
                              <span className="font-sans text-xs font-semibold text-zinc-200 truncate">
                                {q.subject.name} · {q.chapter.name}
                              </span>
                            </div>
                            <span className="text-xs font-sans text-zinc-400 mt-0.5">
                              {reasonFor(q.chapter)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="rounded-md bg-white/[0.04] border border-white/10 px-2 py-0.5 font-mono text-[11px] text-zinc-300 inline-flex items-center gap-1">
                              <AppleEmoji emoji="⏱️" size={11} />
                              <span>{durationEst}</span>
                            </span>
                            {q.needsFreshMind && (
                              <span className="rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[11px] font-semibold text-amber-300 inline-flex items-center gap-1">
                                <AppleEmoji emoji="⚠️" size={11} />
                                <span>Fresh Mind</span>
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                          <span className="font-mono text-xs text-zinc-500">
                            Confidence {q.confidence}/5
                          </span>

                          <div className="flex items-center gap-2">
                            {inToday ? (
                              <span className="inline-flex items-center gap-1 text-xs font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
                                <span>✓</span> In Today's Targets
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void handleAddQueueChapter(q)}
                                aria-label={`Add ${q.subject.name}: ${q.chapter.name} to Today`}
                                className="h-7 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 px-3 font-sans text-xs font-semibold text-sky-300 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                              >
                                <span>+</span>
                                <span>Add to Today</span>
                              </button>
                            )}

                            {onOpenViva && (
                              <button
                                type="button"
                                aria-label={`Launch Oral Exam Viva for ${q.subject.name}: ${q.chapter.name}`}
                                onClick={() => onOpenViva(q.chapter, q.subject)}
                                className="h-7 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 font-mono text-xs font-semibold text-amber-300 transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                              >
                                <AppleEmoji emoji="⚡" size={11} />
                                <span>Viva</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* SECONDARY PANELS (5 Cols on desktop): Focused Companions                 */}
        {/* Deliverables Watchdog, Habits, Schedule, Quick Capture                   */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Secondary Panel 1: School Deliverables Watchdog (Flags Overdue & Urgent) */}
          <section
            aria-labelledby="card-deliverables-h"
            className="rounded-3xl bg-surface border border-white/[0.08] hover:border-white/[0.14] p-5 sm:p-6 shadow-sm flex flex-col gap-4 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                  <AppleEmoji emoji="📋" size={15} />
                </span>
                <div>
                  <h2 id="card-deliverables-h" className="font-sans font-semibold text-base text-white">
                    Due soon
                  </h2>
                  <p className="m-0 text-xs text-zinc-400">
                    Pre-Boards 1 submissions & lab practicals
                  </p>
                </div>
              </div>
              <a href="#deliverables" className="font-sans text-xs text-zinc-400 hover:text-white transition-all">
                View All →
              </a>
            </div>

            {/* Overdue Alert Banner if any overdue items exist */}
            {overdueDeliverables.length > 0 && (
              <div
                role="alert"
                className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200 flex items-start gap-2.5 shadow-sm"
              >
                <AppleEmoji emoji="⚠️" size={16} />
                <div className="flex flex-col min-w-0">
                  <span className="font-semibold text-rose-300">
                    {plural(overdueDeliverables.length, "deliverable")} overdue!
                  </span>
                  <span className="text-xs text-rose-200/90 mt-0.5 truncate">
                    {overdueDeliverables.map((d) => d.name).join(", ")}
                  </span>
                </div>
              </div>
            )}

            {/* Deliverables List */}
            <div className="flex flex-col gap-2.5">
              {sortedDeliverables.slice(0, 5).map((item) => {
                const daysLeft = getDeliverableDaysLeft(item.due);
                const isOverdue = item.status !== "done" && daysLeft !== null && daysLeft < 0;
                const isUrgent = item.status !== "done" && daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

                return (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all ${
                      isOverdue
                        ? "border-rose-500/40 bg-rose-950/20 shadow-2xs"
                        : isUrgent
                          ? "border-amber-500/30 bg-amber-950/15"
                          : "border-white/[0.04] bg-bg/50 hover:border-white/[0.1]"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-sans text-xs font-semibold truncate ${item.status === "done" ? "text-zinc-500 line-through" : isOverdue ? "text-rose-200 font-bold" : "text-zinc-200"}`}>
                          {item.name}
                        </span>
                        {isOverdue && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-500/25 text-rose-300 border border-rose-500/50 text-[11px] font-mono font-bold animate-pulse inline-flex items-center gap-1">
                            <AppleEmoji emoji="⚠️" size={10} />
                            <span>Overdue ({plural(-daysLeft!, "day")} late)</span>
                          </span>
                        )}
                        {isUrgent && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono font-bold animate-pulse inline-flex items-center gap-1">
                            <AppleEmoji emoji="⚡" size={10} />
                            <span>&lt;72h</span>
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[11px] text-zinc-400 uppercase">
                        {item.subject} {item.due ? `· Due ${item.due}` : ""}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.vivaPrep && (
                        <span className="font-mono text-[11px] text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20">
                          Viva
                        </span>
                      )}
                      <a
                        href={getDeliverableGCalUrl(item, state.today)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Add deliverable ${item.name} to Google Calendar`}
                        title="Add to Google Calendar (Morning Handover 08:00 AM)"
                        className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors flex items-center cursor-pointer"
                      >
                        <AppleEmoji emoji="📅" size={12} />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Secondary Panel 2: Habits Consistency */}
          <section
            aria-labelledby="card-habits-h"
            className="rounded-3xl bg-surface border border-white/[0.08] hover:border-white/[0.14] p-5 sm:p-6 shadow-sm flex flex-col gap-4 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <AppleEmoji emoji="🔥" size={15} />
                </span>
                <div>
                  <h2 id="card-habits-h" className="font-sans font-semibold text-base text-white">
                    Habits
                  </h2>
                  <p className="m-0 text-xs text-zinc-400">
                    Daily consistency streaks
                  </p>
                </div>
              </div>
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                {habitsDoneCount}/{state.habits.length} Done
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {state.habits.map((habit) => {
                const done = habit.today >= habit.goal;
                return (
                  <div
                    key={habit.id}
                    onClick={() => handleToggleHabit(habit.id, habit.today, habit.goal)}
                    className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-white/[0.03] transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Check on={done} />
                      <span
                        className={`text-xs font-sans tracking-wide truncate ${
                          done ? "text-zinc-500 line-through" : "text-zinc-200 group-hover:text-white"
                        }`}
                      >
                        <AppleText text={habit.name} size={13} />
                      </span>
                    </div>
                    {habit.streak > 0 && (
                      <span className="font-mono text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md shrink-0 inline-flex items-center gap-1">
                        <AppleEmoji emoji="🔥" size={10} />
                        <span>{habit.streak}d</span>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Secondary Panel 3: Routine & Schedule Timeline */}
          <section
            aria-labelledby="card-routine-h"
            className="rounded-3xl bg-surface border border-white/[0.08] hover:border-white/[0.14] p-5 sm:p-6 shadow-sm flex flex-col gap-4 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
                  <AppleEmoji emoji="⏱️" size={15} />
                </span>
                <div>
                  <h2 id="card-routine-h" className="font-sans font-semibold text-base text-white">
                    Routine & Time Slots
                  </h2>
                  <p className="m-0 text-xs text-zinc-400">
                    Real free study slots avoiding school & tuition
                  </p>
                </div>
              </div>
              <a href="#schedule" className="font-sans text-xs text-zinc-400 hover:text-white">
                Schedule →
              </a>
            </div>

            {/* If tuition / external events exist today */}
            {state.externalEvents && state.externalEvents.length > 0 && (
              <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-950/20 text-xs flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs text-sky-300 font-semibold">
                  <span className="flex items-center gap-1.5">
                    <AppleEmoji emoji="📅" size={12} />
                    <span>Tuition / External Calendar</span>
                  </span>
                  <span className="font-mono text-zinc-400">
                    {state.externalEvents.length} event{state.externalEvents.length > 1 ? "s" : ""}
                  </span>
                </div>
                {state.externalEvents.slice(0, 2).map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-300">
                    <span className="truncate">{ev.summary}</span>
                    <span className="text-zinc-400 shrink-0">{ev.startsAt.slice(11, 16)}–{ev.endsAt.slice(11, 16)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Vertical Routine */}
            <div className="relative flex flex-col gap-3 pl-4 ml-1.5 border-l border-white/[0.1]">
              {(state.scheduleBlocks && state.scheduleBlocks.length > 0
                ? state.scheduleBlocks.map((b) => ({
                    time: `${b.startTime} - ${b.endTime}`,
                    label: b.title,
                    id: String(b.id),
                  }))
                : ROUTINE_BLOCKS.map((rb, idx) => ({
                    time: rb.time,
                    label: rb.label,
                    id: String(idx),
                  }))
              ).map((rb) => (
                <div key={rb.id} className="relative flex items-center gap-3 text-xs">
                  <span className="absolute -left-[21px] size-2 rounded-full border border-black bg-zinc-400" />
                  <span className="font-mono text-xs text-zinc-400 w-24 shrink-0 tabular-nums">
                    {rb.time}
                  </span>
                  <span className="font-sans text-zinc-200 truncate">{rb.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Secondary Panel 4: Quick Capture Buffer */}
          <section
            aria-labelledby="card-capture-h"
            className="rounded-3xl bg-surface border border-white/[0.08] hover:border-white/[0.14] p-5 sm:p-6 shadow-sm flex flex-col gap-4 transition-all"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-semibold text-sm">+</span>
                <h2 id="card-capture-h" className="font-sans font-semibold text-base text-white">
                  Quick Capture Buffer
                </h2>
              </div>
              <span className="font-mono text-xs text-zinc-400">
                {state.captures.filter((c) => !c.done).length} open
              </span>
            </div>

            <div className="flex flex-col gap-2.5">
              <label htmlFor={captureInputId} className="sr-only">Quick capture thought or task</label>
              <textarea
                id={captureInputId}
                rows={2}
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder="Write thought... (#task, #note, #doubt)"
                className="w-full resize-none rounded-xl border border-white/[0.08] bg-bg p-3 text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500 transition-all"
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {[
                    { tag: "#task", color: "text-sky-300 bg-sky-500/10 border-sky-500/30" },
                    { tag: "#note", color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
                    { tag: "#doubt", color: "text-amber-300 bg-amber-500/10 border-amber-500/30" },
                  ].map(({ tag, color }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setCaptureText((cur) => (cur.includes(tag) ? cur : `${cur} ${tag}`.trim()))}
                      className={`h-5 rounded border px-1.5 font-mono text-[11px] uppercase font-bold tracking-wider cursor-pointer ${color}`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleSaveCapture}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-on-solid shadow-xs active:scale-95 transition-all cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>

            {/* Recent Captures */}
            {state.captures.length > 0 && (
              <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.06]">
                {state.captures.slice(0, 3).map((c) => (
                  <div
                    key={c.id}
                    className="flex flex-col gap-1.5 p-2 rounded-xl bg-bg/50 border border-white/[0.04] text-xs"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <span className={`font-sans truncate ${c.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>
                        {c.text}
                      </span>
                      <button
                        type="button"
                        aria-label="Delete capture"
                        onClick={() => act("DELETE", `/api/captures/${c.id}`)}
                        className="text-zinc-500 hover:text-rose-400 font-mono text-xs px-1 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    {!c.done && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.04]">
                        <button
                          type="button"
                          onClick={() => void convertCaptureToTask(c)}
                          className="h-5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 font-mono text-[11px] text-sky-300 hover:bg-sky-500/20 transition-all cursor-pointer"
                        >
                          → Target
                        </button>
                        <button
                          type="button"
                          onClick={() => void convertCaptureToDeliverable(c)}
                          className="h-5 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 font-mono text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-all cursor-pointer"
                        >
                          → Deliverable
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveDoubtId(activeDoubtId === c.id ? null : c.id)}
                          className="h-5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 font-mono text-[11px] text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer"
                        >
                          → Doubt
                        </button>
                      </div>
                    )}

                    {activeDoubtId === c.id && (
                      <div className="mt-1 flex items-center gap-1.5 p-1 rounded bg-amber-500/10 border border-amber-500/20">
                        <select
                          id={`doubt-select-today-${c.id}`}
                          aria-label="Choose chapter for doubt"
                          defaultValue=""
                          onChange={async (e) => {
                            const chId = e.target.value;
                            if (!chId) return;
                            await act("POST", `/api/chapters/${chId}/notes`, { note: `[Doubt] ${c.text}` });
                            await act("PATCH", `/api/captures/${c.id}`, { done: true });
                            setActiveDoubtId(null);
                          }}
                          className="h-6 text-[11px] bg-surface border border-amber-500/40 text-amber-100 rounded px-1.5 font-mono flex-1 focus:outline-none"
                        >
                          <option value="" disabled>Select chapter to link doubt...</option>
                          {state.subjects.map((s) => (
                            <optgroup key={s.id} label={s.name}>
                              {s.chapters.map((ch) => (
                                <option key={ch.id} value={ch.id}>{ch.name}</option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                        <button type="button" onClick={() => setActiveDoubtId(null)} className="text-xs text-zinc-400 hover:text-white px-1">✕</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showCalendarModal && (
        <CalendarModal state={state} act={act} onClose={() => setShowCalendarModal(false)} />
      )}
    </div>
  );
}
