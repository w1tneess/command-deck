import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BrandLogo } from "./ui.tsx";

const PIN_LENGTH = 6;
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];

function GoogleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function PinGate({ onDone }: { onDone: () => void }) {
  const rememberId = useId();
  const [pin, setPin] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, tick] = useState(0);
  const locked = lockedUntil > Date.now();

  const [urlError, setUrlError] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err === "unauthorized" || err === "access_denied") {
      return "Access Denied: Your Google account is not on the authorized whitelist.";
    }
    if (err === "state_mismatch" || err === "oauth_token_failed") {
      return "Google authentication failed. Please try again or use your passcode.";
    }
    if (err) {
      return `Authentication error: ${err}`;
    }
    return "";
  });

  // Re-render each second while locked so the countdown (and the unlock) updates.
  useEffect(() => {
    if (!locked) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [locked]);

  const submit = useCallback(async (value: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: value, remember }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; attemptsLeft?: number; retryAfter?: number };
      if (res.ok) {
        if (typeof window !== "undefined" && window.history?.replaceState) {
          const url = new URL(window.location.href);
          url.searchParams.delete("error");
          window.history.replaceState({}, "", url.pathname + url.hash);
        }
        return onDone();
      }
      navigator.vibrate?.(80);
      setPin("");
      if (res.status === 429) {
        setLockedUntil(Date.now() + (data.retryAfter ?? 900) * 1000);
        setMsg("");
      } else if (res.status === 401) {
        const left = data.attemptsLeft ?? 0;
        setMsg(`Incorrect passcode. ${left} ${left === 1 ? "try" : "tries"} remaining.`);
      } else {
        setMsg(data.error ?? "Couldn't sign in. Please try again.");
      }
    } catch {
      setMsg("Can't reach the server. Check your connection.");
    } finally {
      busyRef.current = false;
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
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 py-8 text-center select-none">
      <div className="w-full rounded-3xl border border-white/10 bg-[#0c0f18]/90 backdrop-blur-2xl p-7 sm:p-9 shadow-2xl flex flex-col items-center">
        <BrandLogo size={48} className="mb-3" />
        <h1 className="m-0 text-xl font-bold tracking-tight text-white">Study OS</h1>
        <p className="mt-1 mb-5 text-xs text-zinc-400">Class 10 CBSE & Life OS Dashboard</p>

        {/* Unauthorized Whitelist Alert Banner */}
        {urlError && (
          <div
            role="alert"
            className="mb-5 w-full rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 leading-relaxed text-left flex items-start gap-2.5 animate-fade-in"
          >
            <span className="shrink-0 text-base leading-none">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-rose-200">Access Restricted</p>
              <p className="mt-0.5 text-[11.5px] opacity-90">{urlError}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setUrlError("");
                if (window.history?.replaceState) {
                  const url = new URL(window.location.href);
                  url.searchParams.delete("error");
                  window.history.replaceState({}, "", url.pathname + url.hash);
                }
              }}
              className="shrink-0 text-rose-400 hover:text-rose-200 text-sm leading-none p-1 transition-colors"
              aria-label="Dismiss error notification"
            >
              ✕
            </button>
          </div>
        )}

        {/* Primary 1-Click Sign In with Google Button */}
        <a
          href="/api/auth/google"
          className="w-full flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] hover:border-white/20 active:scale-[0.98] px-4 py-3 text-sm font-semibold text-white shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-400/50"
        >
          <GoogleIcon className="size-4 shrink-0" />
          <span>Sign in with Google</span>
        </a>

        {/* Visual Divider */}
        <div className="relative my-5 flex w-full items-center justify-center">
          <div className="w-full border-t border-white/[0.08]" />
          <span className="absolute bg-[#0c0f18] px-3 text-[11px] font-medium tracking-wider text-zinc-500 uppercase">
            or enter passcode
          </span>
        </div>

        {/* 6 Digit Indicator Dots */}
        <div className="flex gap-3 items-center justify-center mb-2" role="img" aria-label={`${pin.length} of ${PIN_LENGTH} digits entered`}>
          {Array.from({ length: PIN_LENGTH }, (_, i) => (
            <span
              key={i}
              className={`size-3.5 rounded-full border transition-all duration-150 ${
                i < pin.length
                  ? "border-sky-400 bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.7)] scale-110"
                  : "border-white/15 bg-white/[0.04]"
              }`}
            />
          ))}
        </div>

        {/* Lockout / Error Message */}
        <p role="alert" className="my-3 min-h-6 text-xs font-medium text-rose-400">
          {locked ? `Rate limit active: Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}.` : msg}
        </p>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[240px]">
          {KEYS.map((k, i) => k === "" ? <span key={i} /> : (
            <button
              key={k}
              type="button"
              disabled={busy || locked}
              aria-label={k === "back" ? "Delete last digit" : k}
              onClick={() => press(k)}
              className="size-15 mx-auto rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl font-medium text-white transition-all hover:bg-white/[0.12] hover:border-white/20 active:scale-95 disabled:opacity-20 flex items-center justify-center shadow-xs"
            >
              {k === "back" ? "⌫" : k}
            </button>
          ))}
        </div>

        {/* Remember Device Checkbox */}
        <label htmlFor={rememberId} className="mt-5 flex min-h-9 items-center gap-2.5 text-xs text-zinc-400 cursor-pointer hover:text-white transition-colors">
          <input
            id={rememberId}
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="size-4 rounded-md accent-sky-500 cursor-pointer"
          />
          <span>Remember this device (90 days)</span>
        </label>
      </div>
    </main>
  );
}
