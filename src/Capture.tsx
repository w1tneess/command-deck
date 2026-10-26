import { useEffect, useId, useRef, useState } from "react";
import type { Act, Capture, State } from "./api.ts";
import { AppleText, Btn, Check } from "./ui.tsx";

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
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-3xl lg:rounded-t-none lg:rounded-l-3xl border-t lg:border-t-0 lg:border-l border-line-strong bg-bg/95 backdrop-blur-2xl p-5 shadow-2xl animate-drawer-mobile lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[460px] lg:p-7 lg:animate-drawer-desktop"
      >
        <div className="mx-auto -mt-1 mb-1 h-1 w-10 shrink-0 rounded-full bg-surface3 lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-line">
          <h2 id="capture-h" className="m-0 text-base font-semibold tracking-tight text-fg">Quick add</h2>
          <span className="hidden text-xs text-muted lg:inline"><kbd className="rounded-md border border-line bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-muted">Ctrl/⌘ K</kbd> to toggle</span>
          <Btn kind="ghost" aria-label="Close quick add" onClick={onClose}>✕</Btn>
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
            className="w-full resize-none rounded-xl border border-line-strong bg-surface px-4 py-3 text-sm text-fg focus-visible:ring-2 focus-visible:ring-focus transition-all placeholder:text-muted leading-relaxed font-sans"
          />

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {[
                { tag: "#task", k: "todo" as const, color: "border-focus/40 bg-focus/10 text-focus" },
                { tag: "#note", k: "note" as const, color: "border-accent/30 bg-accent/15 text-accent" },
                { tag: "#doubt", k: "todo" as const, color: "border-warn/30 bg-warn/15 text-warn" },
              ].map(({ tag, k, color }) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setText((cur) => (cur.includes(tag) ? cur : cur ? `${cur} ${tag}` : `${tag} `));
                  }}
                  className={`min-h-[44px] md:min-h-[38px] rounded-[3px] border px-2 font-mono text-[11px] font-bold   transition-all active:scale-95 hover:brightness-125 ${color}`}
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
                  className={`min-h-[44px] md:min-h-[38px] rounded-lg border px-2.5 text-xs font-medium transition-all ${
                    kind === k
                      ? "border-focus/40 bg-focus/20 text-focus font-semibold shadow-xs"
                      : "border-line bg-surface2 text-muted hover:text-fg"
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
          {state.captures.length === 0 && <li className="py-6 text-center text-sm text-muted">Nothing captured yet. Press Enter to record ideas.</li>}
          {state.captures.slice(0, 40).map((c) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-line bg-surface2 p-3 transition-all hover:bg-surface2">
              <div className="flex items-start gap-3">
                {c.kind === "todo" ? (
                  <button type="button" role="switch" aria-checked={c.done} aria-label={`${c.text}: ${doneText(c.done)}`} onClick={() => act("PATCH", `/api/captures/${c.id}`, { done: !c.done })} className="flex size-6 shrink-0 items-center justify-center border-0 bg-transparent active:scale-95 transition-transform"><Check on={c.done} /></button>
                ) : (
                  <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-focus text-sm">•</span>
                )}
                <div className="min-w-0 flex-1">
                  <div className={`text-sm break-words whitespace-pre-wrap ${c.done ? "text-muted line-through" : "text-fg"}`}>
                    <AppleText text={c.text} size={14} />
                  </div>
                  <div className="text-xs text-muted mt-1">{when(c.createdAt)}</div>
                </div>
                <button type="button" aria-label={`Delete ${c.text}`} onClick={() => act("DELETE", `/api/captures/${c.id}`)} className="flex size-6 items-center justify-center rounded-lg border-0 bg-transparent text-xs text-muted hover:text-danger transition-all">✕</button>
              </div>

              {!c.done && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-line">
                  <span className="font-mono text-[11px]   text-muted">Triage:</span>
                  <button
                    type="button"
                    onClick={() => void convertToTask(c)}
                    className="min-h-[44px] md:min-h-[38px] rounded border border-focus/30 bg-focus/10 px-2 font-mono text-[11px] text-focus hover:bg-focus/20 transition-all"
                  >
                    → Today's Task
                  </button>
                  <button
                    type="button"
                    onClick={() => void convertToDeliverable(c)}
                    className="min-h-[44px] md:min-h-[38px] rounded border border-focus/30 bg-focus/10 px-2 font-mono text-[11px] text-focus hover:bg-focus/20 transition-all"
                  >
                    → School Deliverable
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDoubtId(activeDoubtId === c.id ? null : c.id)}
                    className="min-h-[44px] md:min-h-[38px] rounded border border-warn/30 bg-warn/15 px-2 font-mono text-[11px] text-warn hover:bg-warn/15 transition-all"
                  >
                    → Link Doubt
                  </button>
                </div>
              )}

              {activeDoubtId === c.id && (
                <div className="mt-1 flex items-center gap-2 p-2 rounded-lg bg-warn/15 border border-warn/30">
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
                    className="min-h-[44px] md:min-h-[38px] text-xs bg-surface border border-warn/30 text-warn rounded px-2 font-mono flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
                  <button type="button" onClick={() => setActiveDoubtId(null)} className="text-xs text-muted hover:text-fg px-1">✕</button>
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
