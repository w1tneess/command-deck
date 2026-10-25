import { useState } from "react";
import { call } from "./api.ts";
import { signOut } from "./session.ts";
import type { Theme } from "./theme.ts";
import { Btn, Card, H2 } from "./ui.tsx";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System Default" },
  { id: "dark", label: "Dark Mode" },
  { id: "light", label: "Light Mode" },
];

export function Backup({ reload, theme, setTheme }: { reload: () => Promise<void>; theme: Theme; setTheme: (t: Theme) => void }) {
  const [msg, setMsg] = useState("");
  let last = "";
  try { last = localStorage.getItem("last-backup") ?? ""; } catch { /* optional */ }

  const download = async () => {
    try {
      const data = await call("GET", "/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `study-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      try { localStorage.setItem("last-backup", new Date().toISOString()); } catch { /* optional */ }
      setMsg("Backup downloaded successfully.");
    } catch {
      setMsg("Couldn't create the backup. Check your connection and try again.");
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { setMsg("That file isn't valid JSON, so nothing was changed."); return; }
    if (!confirm("Restoring replaces everything in the app with this backup. Continue?")) return;
    try {
      await call("POST", "/api/import", data);
      await reload();
      setMsg("Restored from backup.");
    } catch (e) {
      setMsg(`${e instanceof Error ? e.message : "Restore failed."} Nothing was changed.`);
    }
  };

  return (
    <>
      <header className="border-b border-white/[0.08] pb-5">
        <div className="text-xs font-medium text-zinc-400">Settings & State Management</div>
        <h1 className="m-0 mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-white">Data Vault & Config</h1>
      </header>
      <div className="flex max-w-3xl flex-col gap-5 lg:gap-6">
        <Card labelledBy="backup-h">
          <H2 id="backup-h">Backup & Restore State</H2>
          <p className="mt-2 mb-1 text-sm text-zinc-300 leading-relaxed">Your data resides in Cloudflare D1 with automatic persistence. Export snapshots regularly prior to major syllabus updates.</p>
          <p className="m-0 text-xs text-zinc-500 font-mono">{last ? `Last exported snapshot: ${new Date(last).toLocaleString("en-IN")}` : "No export logged in this session."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Btn kind="primary" onClick={download}>Download JSON Snapshot</Btn>
            <label className="flex h-9 cursor-pointer items-center rounded-lg border border-white/15 bg-white/[0.05] px-4 text-xs font-medium text-zinc-200 hover:border-white/30 hover:bg-white/[0.08] transition-all focus-within:outline-2 focus-within:outline-sky-400">
              Restore from File
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {msg && <p role="status" className="mt-3.5 mb-0 text-xs font-medium text-amber-400">{msg}</p>}
        </Card>

        <Card labelledBy="theme-h">
          <H2 id="theme-h">Appearance & Theme</H2>
          <div className="mt-4 inline-flex rounded-xl bg-white/[0.03] p-1 border border-white/[0.08]" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} className={`h-8.5 rounded-lg px-4 text-xs font-medium transition-all ${theme === t.id ? "bg-white text-zinc-950 font-semibold shadow-xs" : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 mb-0 text-xs text-zinc-500">System mode automatically adapts to your operating system's color profile.</p>
        </Card>

        <Card labelledBy="device-h">
          <H2 id="device-h">Session Security</H2>
          <p className="mt-2 mb-3 text-sm text-zinc-300 leading-relaxed">Sign out of this browser session, or invalidate all authenticated devices globally.</p>
          <div className="flex flex-wrap gap-3">
            <Btn kind="outline" onClick={() => signOut("/api/logout")}>Sign Out</Btn>
            <Btn kind="outline" onClick={() => { if (confirm("Sign out of every phone and computer, including this one?")) void signOut("/api/logout-all"); }}>Revoke All Active Sessions</Btn>
          </div>
        </Card>
      </div>
    </>
  );
}
