import { useEffect, useId, useRef, useState } from "react";
import type { Act, Capture, State } from "./api.ts";
import { Btn, Check } from "./ui.tsx";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** Quick capture: a drawer for brain dumps, notes and to-dos. Enter saves, Shift+Enter adds a line, Escape closes. */
export function CaptureDrawer({ state, act, onClose }: { state: State; act: Act; onClose: () => void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Capture["kind"]>("note");
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

  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-h"
        onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-3 overflow-y-auto rounded-t-[28px] border border-line/80 bg-surface/90 backdrop-blur-2xl p-4 shadow-[0_-12px_48px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.08)] animate-drawer-mobile lg:inset-y-0 lg:right-0 lg:left-auto lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-[28px] lg:p-6 lg:animate-drawer-desktop"
      >
        <div className="mx-auto -mt-1 mb-1 h-1 w-9 shrink-0 rounded-full bg-line lg:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3">
          <h2 id="capture-h" className="m-0 text-[17px] font-semibold tracking-[-0.015em]">Quick capture</h2>
          <span className="hidden text-xs text-muted lg:inline"><kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[11px]">Ctrl/⌘ K</kbd> to toggle</span>
          <Btn kind="ghost" aria-label="Close quick capture" onClick={onClose}>Close</Btn>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="flex flex-col gap-2.5">
          <label htmlFor={textId} className="sr-only">What is on your mind?</label>
          <textarea
            id={textId}
            ref={input}
            rows={3}
            maxLength={500}
            value={text}
            placeholder="Brain dump, to-do or note. Enter to save."
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void save(); } }}
            className="w-full resize-none rounded-xl border border-line bg-surface2/60 px-3.5 py-3 text-[15px] text-fg focus:border-accent focus:bg-surface2 transition-all placeholder:text-muted/60"
          />
          <div className="flex items-center justify-between gap-2">
            <div role="group" aria-label="Save as" className="flex gap-1.5">
              {(["note", "todo"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => setKind(k)}
                  className={`h-10 rounded-xl border px-3.5 text-[13px] font-medium transition-all ${
                    kind === k
                      ? "border-accent/40 bg-accent/15 text-accent-text shadow-[0_0_8px_rgba(99,102,241,0.2)] font-semibold"
                      : "border-line bg-surface2/40 text-muted hover:text-fg hover:bg-surface2/80"
                  }`}
                >
                  {k === "note" ? "Note" : "To-do"}
                </button>
              ))}
            </div>
            <Btn type="submit" kind="primary" disabled={!text.trim() || saving}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        </form>
        <ul className="m-0 flex list-none flex-col p-0">
          {state.captures.length === 0 && <li className="border-t border-line py-4 text-[14px] text-muted">Nothing captured yet.</li>}
          {state.captures.slice(0, 40).map((c) => (
            <li key={c.id} className="flex items-start gap-1 border-t border-line py-1">
              {c.kind === "todo" ? (
                <button type="button" role="switch" aria-checked={c.done} aria-label={`${c.text}: ${c.done ? "done" : "not done"}`} onClick={() => act("PATCH", `/api/captures/${c.id}`, { done: !c.done })} className="flex size-11 shrink-0 items-center justify-center border-0 bg-transparent"><Check on={c.done} /></button>
              ) : (
                <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center text-muted">•</span>
              )}
              <div className="min-w-0 flex-1 py-2.5">
                <div className={`text-[15px] break-words whitespace-pre-wrap ${c.done ? "text-muted line-through" : ""}`}>{c.text}</div>
                <div className="text-xs text-muted">{c.kind === "todo" ? "To-do" : "Note"} · {when(c.createdAt)}</div>
              </div>
              <button type="button" aria-label={`Delete: ${c.text}`} onClick={() => act("DELETE", `/api/captures/${c.id}`)} className="flex min-h-11 items-center border-0 bg-transparent px-2 text-[13px] text-muted">Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
