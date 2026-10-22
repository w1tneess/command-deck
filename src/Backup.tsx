import { useState } from "react";
import { call } from "./api.ts";
import { signOut } from "./session.ts";
import type { Theme } from "./theme.ts";
import { Btn, Card, H2 } from "./ui.tsx";

const THEMES: { id: Theme; label: string }[] = [
  { id: "system", label: "System" },
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
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
      setMsg("Backup downloaded.");
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
      <header>
        <div className="text-xs uppercase tracking-[0.06em] text-muted lg:text-[13px]">Your data</div>
        <h1 className="m-0 mt-0.5 text-[28px] font-semibold tracking-[-0.02em] lg:mt-1 lg:text-[30px]">Backup</h1>
      </header>
      <div className="flex max-w-3xl flex-col gap-4 lg:gap-6">
        <Card labelledBy="backup-h">
          <H2 id="backup-h">Backup and restore</H2>
          <p className="mt-2 mb-1 text-[14px]">Your progress lives in the cloud database. Download a copy now and then, and before any big change.</p>
          <p className="m-0 text-[13px] text-muted">{last ? `Last backup from this browser: ${new Date(last).toLocaleString("en-IN")}.` : "No backup made from this browser yet."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Btn kind="primary" onClick={download}>Download backup</Btn>
            <label className="flex h-11 cursor-pointer items-center rounded-xl border border-line bg-surface2 px-4 text-[14px] focus-within:outline-2 focus-within:outline-accent">
              Restore from file
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {msg && <p role="status" className="mt-3 mb-0 text-[13px]">{msg}</p>}
        </Card>

        <Card labelledBy="theme-h">
          <H2 id="theme-h">Appearance</H2>
          <div className="mt-3 flex gap-2" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)} className={`h-11 rounded-xl border px-5 text-[14px] font-medium ${theme === t.id ? "border-accent bg-accent text-ink" : "border-line bg-surface2 text-fg"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 mb-0 text-[13px] text-muted">System follows your device.</p>
        </Card>

        <Card labelledBy="device-h">
          <H2 id="device-h">This device</H2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Btn kind="outline" onClick={() => signOut("/api/logout")}>Sign out</Btn>
            <Btn kind="outline" onClick={() => { if (confirm("Sign out of every phone and computer, including this one?")) void signOut("/api/logout-all"); }}>Sign out of all devices</Btn>
          </div>
        </Card>
      </div>
    </>
  );
}
