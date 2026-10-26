import { useEffect } from "react";
import { useState } from "react";
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

/** The only way in is a Google account on the owner's allow-list; the server checks it, this just starts the flow. */
export function SignIn() {
  useEffect(() => { document.title = "Sign in · Command Deck"; }, []);
  const [urlError, setUrlError] = useState(() => {
    const err = new URLSearchParams(window.location.search).get("error");
    if (!err) return "";
    if (err === "unauthorized" || err === "access_denied") return "That Google account isn't on the allowed list.";
    if (err === "state_mismatch" || err === "oauth_token_failed") return "Google sign-in failed. Please try again.";
    return `Sign-in error: ${err}`;
  });
  const dismiss = () => {
    setUrlError("");
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    window.history.replaceState({}, "", url.pathname + url.hash);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 py-8 text-center">
      <div className="flex w-full flex-col items-center rounded-3xl border border-line bg-bg/90 p-7 shadow-2xl backdrop-blur-2xl sm:p-9">
        <BrandLogo size={48} className="mb-3" />
        <h1 className="m-0 text-xl font-bold tracking-tight text-fg">Command Deck</h1>
        <p className="mt-1 mb-6 text-sm text-muted">Class 10 CBSE study dashboard</p>

        {urlError && (
          <div role="alert" className="mb-5 flex w-full items-start gap-2.5 rounded-2xl border border-danger/30 bg-danger/10 p-3 text-left text-sm text-danger animate-fade-in">
            <p className="m-0 flex-1">{urlError}</p>
            <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 cursor-pointer border-0 bg-transparent p-1 text-danger">✕</button>
          </div>
        )}

        <a
          href="/api/auth/google"
          className="flex min-h-12 w-full items-center justify-center gap-3 rounded-2xl border border-line bg-surface3 px-4 py-3 text-base font-semibold text-fg shadow-xs transition-all hover:border-line-strong active:scale-[0.98]"
        >
          <GoogleIcon className="size-5 shrink-0" />
          <span>Sign in with Google</span>
        </a>
        <p className="mt-4 mb-0 text-sm text-muted">Private. Only the owner's Google account can sign in.</p>
      </div>
    </main>
  );
}
