import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { BrandLogo } from "./ui.tsx";

function GoogleIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

type Step = "signin" | "email" | "code";
type Reply = { error?: string; attemptsLeft?: number; retryAfter?: number };

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { res, data: (await res.json().catch(() => ({}))) as Reply };
};

const field = "h-11 w-full rounded-xl border border-line-strong bg-surface px-3.5 text-base text-fg placeholder:text-muted";

/** Sign in with Google, or with an email address and a password that was set by confirming a one-time code. */
export function SignIn({ onDone }: { onDone: () => void }) {
  const id = useId();
  const [step, setStep] = useState<Step>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [msg, setMsg] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [, tick] = useState(0);
  const locked = lockedUntil > Date.now();
  const wait = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));

  const [urlError, setUrlError] = useState(() => {
    const err = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("error");
    if (!err) return "";
    if (err === "unauthorized" || err === "access_denied") return "That Google account isn't on the allowed list.";
    if (err === "state_mismatch" || err === "oauth_token_failed") return "Google sign-in failed. Try again, or use your email and password.";
    return `Sign-in error: ${err}`;
  });
  const clearUrlError = () => {
    setUrlError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.pathname + url.hash);
  };

  // Re-render each second while locked so the countdown (and the unlock) updates.
  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [locked]);

  const go = (next: Step) => { setStep(next); setMsg(""); setInfo(""); setPassword(""); setCode(""); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busyRef.current || locked) return;
    busyRef.current = true;
    setBusy(true);
    setMsg("");
    try {
      const { res, data } = step === "signin" ? await post("/api/auth/email/login", { email, password, remember })
        : step === "email" ? await post("/api/auth/email/request", { email })
        : await post("/api/auth/email/set-password", { email, code, password, remember });
      if (res.ok && step === "email") { setStep("code"); setInfo(`If ${email.trim()} is allowed, a 6-digit code is on its way. It works once and expires in 10 minutes.`); return; }
      if (res.ok) { if (urlError) clearUrlError(); return onDone(); }
      navigator.vibrate?.(80);
      setPassword("");
      if (res.status === 429) setLockedUntil(Date.now() + (data.retryAfter ?? 900) * 1000);
      else if (typeof data.attemptsLeft === "number") setMsg(`${data.error} ${data.attemptsLeft} ${data.attemptsLeft === 1 ? "try" : "tries"} left.`);
      else setMsg(data.error ?? "Couldn't sign in. Please try again.");
    } catch {
      setMsg("Can't reach the server. Check your connection.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const rememberBox = (
    <label className="flex min-h-9 items-center gap-2.5 text-sm text-muted cursor-pointer hover:text-fg">
      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 cursor-pointer rounded-md" />
      <span>Remember this device (90 days)</span>
    </label>
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 py-8 text-center">
      <div className="flex w-full flex-col items-center rounded-3xl border border-line bg-bg/90 p-7 shadow-2xl backdrop-blur-2xl sm:p-9">
        <BrandLogo size={48} className="mb-3" />
        <h1 className="m-0 text-xl font-bold tracking-tight text-fg">Command Deck</h1>
        <p className="mt-1 mb-5 text-sm text-muted">Class 10 CBSE study dashboard</p>

        {urlError && (
          <div role="alert" className="mb-5 flex w-full items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-left text-sm text-danger animate-fade-in">
            <p className="m-0 flex-1">{urlError}</p>
            <button type="button" onClick={clearUrlError} aria-label="Dismiss" className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-danger">✕</button>
          </div>
        )}

        <a
          href="/api/auth/google"
          className="flex w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface3 px-4 py-3 text-sm font-semibold text-fg shadow-xs transition-all hover:border-line-strong active:scale-[0.98]"
        >
          <GoogleIcon className="size-4 shrink-0" />
          <span>Sign in with Google</span>
        </a>

        <div className="relative my-5 flex w-full items-center justify-center">
          <div className="w-full border-t border-line" />
          <span className="absolute bg-bg px-3 text-xs font-medium text-muted">or use your email</span>
        </div>

        <form onSubmit={(e) => void submit(e)} className="flex w-full flex-col gap-3 text-left">
          {step === "code" && info && <p role="status" className="m-0 text-sm text-muted">{info}</p>}

          <label htmlFor={`${id}-email`} className="text-sm font-medium text-fg">Email</label>
          <input id={`${id}-email`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} readOnly={step === "code"} className={field} />

          {step === "code" && (
            <>
              <label htmlFor={`${id}-code`} className="text-sm font-medium text-fg">6-digit code from the email</label>
              <input id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={`${field} tracking-[0.3em]`} />
            </>
          )}

          {step !== "email" && (
            <>
              <label htmlFor={`${id}-pw`} className="text-sm font-medium text-fg">{step === "code" ? "New password (at least 12 characters)" : "Password"}</label>
              <input id={`${id}-pw`} type="password" autoComplete={step === "code" ? "new-password" : "current-password"} required minLength={step === "code" ? 12 : undefined} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
              {rememberBox}
            </>
          )}

          <p role="alert" className="m-0 min-h-5 text-sm font-medium text-danger">
            {locked ? `Too many tries. Try again in ${Math.floor(wait / 60)}:${String(wait % 60).padStart(2, "0")}.` : msg}
          </p>

          <button type="submit" disabled={busy || locked} className="min-h-11 cursor-pointer rounded-xl border-0 bg-fg px-4 text-base font-semibold text-bg disabled:opacity-40">
            {step === "signin" ? "Sign in" : step === "email" ? "Email me a code" : "Set password and sign in"}
          </button>
        </form>

        <div className="mt-4 flex flex-col items-center gap-1 text-sm">
          {step === "signin" ? (
            <button type="button" onClick={() => go("email")} className="cursor-pointer border-0 bg-transparent p-1 text-muted underline hover:text-fg">First time here, or forgot your password?</button>
          ) : (
            <button type="button" onClick={() => go("signin")} className="cursor-pointer border-0 bg-transparent p-1 text-muted underline hover:text-fg">Back to sign in</button>
          )}
        </div>
      </div>
    </main>
  );
}
