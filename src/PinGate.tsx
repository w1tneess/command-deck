import { useCallback, useEffect, useState } from "react";
import { Icon } from "./ui.tsx";

const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

export function PinGate({ onDone }: { onDone: () => void }) {
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full rounded-[28px] border border-line/80 bg-surface/85 backdrop-blur-2xl p-7 shadow-[0_16px_48px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] flex flex-col items-center">
        <div className="mb-4 flex size-13 items-center justify-center rounded-2xl bg-gradient-to-tr from-accent to-[#818cf8] text-white shadow-[0_4px_16px_rgba(99,102,241,0.4)] border border-white/20">
          <Icon d="M9 11l3 3L22 4" size={26} stroke={2.4} />
        </div>
        <h1 className="m-0 text-[26px] font-semibold tracking-tight text-fg">Study OS</h1>
        <p className="mt-1 mb-6 text-[14px] text-muted font-medium">Enter your 6-digit passcode</p>

        <div className="flex gap-3.5 items-center justify-center" role="img" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full border transition-all duration-200 ${
                i < pin.length
                  ? "border-accent bg-accent shadow-[0_0_10px_var(--accent)] scale-110"
                  : "border-line-strong bg-surface2/60"
              }`}
            />
          ))}
        </div>

        <p role="alert" className="my-4 min-h-6 text-[13px] font-medium text-warn">
          {locked ? `Too many wrong tries. Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}.` : msg}
        </p>

        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {KEYS.map((k, i) => k === "" ? <span key={i} /> : (
            <button
              key={k}
              type="button"
              disabled={busy || locked}
              aria-label={k === "back" ? "Delete last digit" : k}
              onClick={() => press(k)}
              className="size-[72px] mx-auto rounded-full border border-line/80 bg-surface2/75 text-[24px] font-medium text-fg shadow-xs transition-all duration-150 hover:bg-surface2 hover:border-line-strong active:scale-90 active:bg-accent active:text-ink active:shadow-[0_0_12px_var(--accent)]"
            >
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        <label className="mt-6 flex min-h-11 items-center gap-2.5 text-[13px] text-muted cursor-pointer hover:text-fg transition-colors">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4.5 rounded-md accent-[var(--accent)] cursor-pointer" />
          <span>Remember this device for 90 days</span>
        </label>
      </div>
    </main>
  );
}
