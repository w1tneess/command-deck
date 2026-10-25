import { useEffect, useId, useRef, useState } from "react";
import type { Act, Capture, State } from "./api.ts";
import { AppleEmoji, AppleText, Btn, Card, Check } from "./ui.tsx";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

export const guessSubject = (text: string, subjects: State["subjects"]): string => {
  const lower = text.toLowerCase();
  for (const s of subjects) {
    if (lower.includes(s.name.toLowerCase()) || lower.includes(s.id.toLowerCase())) {
      return s.id;
    }
  }
  if (/triang|circl|equat|quad|polynom|arith|coord|trigo|stat|prob/i.test(lower)) return "maths";
  if (/chemi|react|acid|base|metal|carbon|life|process|repro|hered|light|electr|magnet/i.test(lower)) return "science";
  if (/nation|europe|india|resourc|forest|water|agri|power|feder|gender|money|global/i.test(lower)) return "social";
  if (/letter|prose|poem|footprint|gramm/i.test(lower)) return "english";
  if (/it|ai|comput|program|cyber|code/i.test(lower)) return "it";
  return subjects[0]?.id ?? "science";
};

export const addDaysToToday = (todayStr: string, days: number): string => {
  try {
    const [y, m, d] = todayStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d + days);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  } catch {
    return todayStr;
  }
};

/** Quick capture: a drawer for brain dumps, notes and to-dos. Enter saves, Shift+Enter adds a line, Escape closes. */
export function CaptureDrawer({ state, act, onClose }: { state: State; act: Act; onClose: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Capture["kind"]>("note");
  const [activeDoubtId, setActiveDoubtId] = useState<number | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const textId = useId();

  const [saving, setSaving] = useState(false);

  // Focus the box on open, and hand focus back to whatever opened the drawer when it closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const save = async () => {
    const toSave = text.trim();
    if (!toSave || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      if (await act("POST", "/api/captures", { text: toSave, kind })) {
        setText((cur) => (cur.trim() === toSave ? "" : cur));
        input.current?.focus();
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const convertToTask = async (c: Capture) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      await act("POST", "/api/targets", { title: clean || c.text, duration: "45m" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      busy.current = false;
    }
  };

  const convertToDeliverable = async (c: Capture) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      const sub = guessSubject(c.text, state.subjects);
      const due = addDaysToToday(state.today, 3);
      await act("POST", "/api/deliverables", { name: clean || c.text, subject: sub, due, detail: "Captured from Inbox" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      busy.current = false;
    }
  };

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-h"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl border-t lg:border-t-0 lg:border-l border-white/[0.1] bg-bg/95 backdrop-blur-2xl p-5 shadow-2xl animate-drawer-mobile lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[460px] lg:p-7 lg:animate-drawer-desktop"
      >
        <div className="mx-auto -mt-1 mb-1 h-1 w-10 shrink-0 rounded-full bg-white/20 lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-white/[0.08]">
          <h2 id="capture-h" className="m-0 text-base font-semibold tracking-tight text-white">Quick Capture Buffer</h2>
          <span className="hidden text-xs text-zinc-400 lg:inline"><kbd className="rounded-md border border-white/10 bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">Ctrl/⌘ K</kbd> to toggle</span>
          <Btn kind="ghost" aria-label="Close quick capture" onClick={onClose}>✕</Btn>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-3">
          <label htmlFor={textId} className="sr-only">What is on your mind?</label>
          <textarea
            id={textId}
            ref={input}
            rows={3}
            maxLength={500}
            value={text}
            placeholder="Jot down a quick thought, task, or study reminder..."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } }}
            className="w-full resize-none rounded-xl border border-white/15 bg-surface px-4 py-3 text-sm text-white focus:border-sky-400 transition-all placeholder:text-zinc-500 leading-relaxed font-sans"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {[
                { tag: "#task", k: "todo" as const, color: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
                { tag: "#note", k: "note" as const, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
                { tag: "#doubt", k: "todo" as const, color: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
              ].map(({ tag, k, color }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setText((cur) => (cur.includes(tag) ? cur : cur ? `${cur} ${tag}` : `${tag} `));
                  }}
                  className={`h-6 rounded-[3px] border px-2 font-mono text-[11px] font-bold   transition-all active:scale-95 hover:brightness-125 ${color}`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div role="group" aria-label="Save as" className="flex gap-1.5">
              {(["note", "todo"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`h-7 rounded-lg border px-2.5 text-xs font-medium transition-all ${
                    kind === k
                      ? "border-sky-500/40 bg-sky-500/20 text-sky-300 font-semibold shadow-xs"
                      : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-white"
                  }`}
                >
                  {k === "note" ? "Note" : "To-do"}
                </button>
              ))}
            </div>
            <Btn type="submit" kind="primary" disabled={!text.trim() || saving}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        </form>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 mt-2">
          {state.captures.length === 0 && <li className="py-6 text-center text-sm text-zinc-500">Nothing captured yet. Press Enter to record ideas.</li>}
          {state.captures.slice(0, 40).map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 transition-all hover:bg-white/[0.04]">
              <div className="flex items-start gap-3">
                {c.kind === "todo" ? (
                  <button type="button" role="switch" aria-checked={c.done} aria-label={`${c.text}: ${doneText(c.done)}`} onClick={() => act("PATCH", `/api/captures/${c.id}`, { done: !c.done })} className="flex size-6 shrink-0 items-center justify-center border-0 bg-transparent active:scale-95 transition-transform"><Check on={c.done} /></button>
                ) : (
                  <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-sky-400 text-sm">•</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm break-words whitespace-pre-wrap ${c.done ? "text-zinc-500 line-through" : "text-white"}`}>
                    <AppleText text={c.text} size={14} />
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{when(c.createdAt)}</div>
                </div>
                <button type="button" aria-label={`Delete ${c.text}`} onClick={() => act("DELETE", `/api/captures/${c.id}`)} className="flex size-6 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-zinc-500 hover:text-rose-400 transition-all">✕</button>
              </div>

              {!c.done && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-white/[0.04]">
                  <span className="font-mono text-[11px]   text-zinc-500">Triage:</span>
                  <button
                    type="button"
                    onClick={() => void convertToTask(c)}
                    className="h-5.5 rounded border border-sky-500/30 bg-sky-500/10 px-2 font-mono text-[11px] text-sky-300 hover:bg-sky-500/20 transition-all"
                  >
                    → Today's Task
                  </button>
                  <button
                    type="button"
                    onClick={() => void convertToDeliverable(c)}
                    className="h-5.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 font-mono text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-all"
                  >
                    → School Deliverable
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDoubtId(activeDoubtId === c.id ? null : c.id)}
                    className="h-5.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 font-mono text-[11px] text-amber-300 hover:bg-amber-500/20 transition-all"
                  >
                    → Link Doubt
                  </button>
                </div>
              )}

              {activeDoubtId === c.id && (
                <div className="mt-1 flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <label htmlFor={`ch-select-drawer-${c.id}`} className="sr-only">Choose chapter for doubt</label>
                  <select
                    id={`ch-select-drawer-${c.id}`}
                    defaultValue=""
                    onChange={async (e) => {
                      const chId = e.target.value;
                      if (!chId) return;
                      await act("POST", `/api/chapters/${chId}/notes`, { note: `[Doubt] ${c.text}` });
                      await act("PATCH", `/api/captures/${c.id}`, { done: true });
                      setActiveDoubtId(null);
                    }}
                    className="h-7 text-xs bg-surface border border-amber-500/40 text-amber-100 rounded px-2 font-mono flex-1 focus:outline-none focus:border-amber-400"
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
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

const doneText = (done: boolean) => (done ? "done" : "not done");

/** Center-Rail Quick Capture Inbox for fast flow without opening drawers. */
export function QuickCaptureInbox({ state, act, onOpenDrawer }: { state: State; act: Act; onOpenDrawer?: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Capture["kind"]>("todo");
  const [activeDoubtId, setActiveDoubtId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const inputId = useId();

  const save = async () => {
    const toSave = text.trim();
    if (!toSave || busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      if (await act("POST", "/api/captures", { text: toSave, kind })) {
        setText((cur) => (cur.trim() === toSave ? "" : cur));
      }
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };

  const convertToTask = async (c: Capture) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      await act("POST", "/api/targets", { title: clean || c.text, duration: "45m" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      busy.current = false;
    }
  };

  const convertToDeliverable = async (c: Capture) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const clean = c.text.replace(/#(task|note|doubt)/gi, "").trim();
      const sub = guessSubject(c.text, state.subjects);
      const due = addDaysToToday(state.today, 3);
      await act("POST", "/api/deliverables", { name: clean || c.text, subject: sub, due, detail: "Captured from Inbox" });
      await act("PATCH", `/api/captures/${c.id}`, { done: true });
    } finally {
      busy.current = false;
    }
  };

  const recent = state.captures.slice(0, 5);

  return (
    <Card labelledBy="capture-inbox-h">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-[1px] bg-fg" />
          <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-zinc-400 ">INBOX // QUICK CAPTURE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-400">
            {state.captures.filter((c) => !c.done).length} open
          </span>
          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              className="font-mono text-[11px] text-zinc-400 hover:text-white  transition-colors"
            >
              Drawer [Ctrl+K]
            </button>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2">
          <input
            id={inputId}
            value={text}
            placeholder={kind === "todo" ? "Add to-do, task, or #doubt..." : "Quick thought or #note..."}
            onChange={(e) => setText(e.target.value)}
            disabled={saving}
            className="h-8.5 flex-1 rounded-[2px] border border-white/[0.12] bg-surface px-3 font-mono text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-sky-400 transition-all"
          />
          <Btn type="submit" kind="primary" disabled={!text.trim() || saving}>
            {saving ? "…" : "+ Add"}
          </Btn>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[11px]   text-zinc-400">Quick Tags:</span>
            {[
              { tag: "#task", k: "todo" as const, color: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
              { tag: "#note", k: "note" as const, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
              { tag: "#doubt", k: "todo" as const, color: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
            ].map(({ tag, k, color }) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setKind(k);
                  setText((cur) => (cur.includes(tag) ? cur : cur ? `${cur} ${tag}` : `${tag} `));
                }}
                className={`h-5.5 rounded-[2px] border px-1.5 font-mono text-[11px] font-bold   transition-all active:scale-95 hover:brightness-125 ${color}`}
              >
                {tag}
              </button>
            ))}
          </div>

          <div role="group" aria-label="Kind" className="flex gap-1">
            {(["todo", "note"] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-5.5 rounded-[2px] border px-2 font-mono text-[11px]  font-bold  transition-all ${
                  kind === k
                    ? "border-sky-500/40 bg-sky-500/20 text-sky-300"
                    : "border-white/[0.08] bg-transparent text-zinc-400 hover:text-white"
                }`}
              >
                {k === "todo" ? "To-do" : "Note"}
              </button>
            ))}
          </div>
        </div>
      </form>

      {recent.length > 0 && (
        <ul className="m-0 list-none p-0 flex flex-col gap-2 mt-2.5 pt-2.5 border-t border-white/[0.06]">
          {recent.map((c) => (
            <li
              key={c.id}
              className="group flex flex-col gap-1.5 rounded-[2px] border border-white/[0.06] bg-surface/60 p-2 transition-all hover:bg-surface hover:border-white/[0.12]"
            >
              <div className="flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {c.kind === "todo" ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={c.done}
                      aria-label={`${c.text}: ${doneText(c.done)}`}
                      onClick={() => act("PATCH", `/api/captures/${c.id}`, { done: !c.done })}
                      className="flex size-4 shrink-0 items-center justify-center border-0 bg-transparent p-0 active:scale-95 transition-transform"
                    >
                      <Check on={c.done} />
                    </button>
                  ) : (
                    <span className="size-1.5 rounded-[1px] bg-fg shrink-0" aria-hidden="true" />
                  )}
                  <span className={`truncate text-xs font-mono font-medium ${c.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                    <AppleText text={c.text} size={13} />
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Delete ${c.text}`}
                  onClick={() => act("DELETE", `/api/captures/${c.id}`)}
                  className="opacity-0 group-hover:opacity-100 text-zinc-400 hover:text-rose-400 font-mono text-xs transition-opacity px-1"
                >
                  ✕
                </button>
              </div>

              {!c.done && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-white/[0.04]">
                  <span className="font-mono text-[11px]   text-zinc-500">Triage:</span>
                  <button
                    type="button"
                    onClick={() => void convertToTask(c)}
                    className="h-5 rounded border border-sky-500/30 bg-sky-500/10 px-1.5 font-mono text-[11px] text-sky-300 hover:bg-sky-500/20 transition-all"
                  >
                    → Task
                  </button>
                  <button
                    type="button"
                    onClick={() => void convertToDeliverable(c)}
                    className="h-5 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 font-mono text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition-all"
                  >
                    → Deliverable
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDoubtId(activeDoubtId === c.id ? null : c.id)}
                    className="h-5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 font-mono text-[11px] text-amber-300 hover:bg-amber-500/20 transition-all"
                  >
                    → Doubt
                  </button>
                </div>
              )}

              {activeDoubtId === c.id && (
                <div className="flex items-center gap-1.5 p-1 rounded bg-amber-500/10 border border-amber-500/20">
                  <label htmlFor={`ch-select-inbox-${c.id}`} className="sr-only">Choose chapter for doubt</label>
                  <select
                    id={`ch-select-inbox-${c.id}`}
                    defaultValue=""
                    onChange={async (e) => {
                      const chId = e.target.value;
                      if (!chId) return;
                      await act("POST", `/api/chapters/${chId}/notes`, { note: `[Doubt] ${c.text}` });
                      await act("PATCH", `/api/captures/${c.id}`, { done: true });
                      setActiveDoubtId(null);
                    }}
                    className="h-6 text-xs bg-surface border border-amber-500/40 text-amber-100 rounded px-1.5 font-mono flex-1 focus:outline-none focus:border-amber-400"
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
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
