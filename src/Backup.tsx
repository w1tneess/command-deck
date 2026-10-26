import { useState } from "react";
import { call } from "./api.ts";
import { signOut } from "./session.ts";
import type { Theme } from "./theme.ts";
import { Btn, Card, H2, PageHeader, Segmented } from "./ui.tsx";

const THEMES = [["system", "Match device"], ["light", "Light"], ["dark", "Dark"]] as const;

export function Backup({ reload, theme, setTheme }: { reload: () => Promise<void>; theme: Theme; setTheme: (t: Theme) => void }) {
  const [msg, setMsg] = useState("");
  let last = "";
  try { last = localStorage.getItem("last-backup") ?? ""; } catch { /* optional */ }

  const download = async () => {
    try {
      const data = await call("GET", "/api/export");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      a.download = `command-deck-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}.json`;
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
      <PageHeader title="Settings" sub="Backups, appearance and signing out." />
      <div className="flex max-w-3xl flex-col gap-6">
        <Card labelledBy="backup-h">
          <H2 id="backup-h">Back up your data</H2>
          <p className="mt-2 mb-1 text-base text-muted">Everything lives in the cloud already. Download a copy before big changes, such as re-importing the syllabus.</p>
          <p className="m-0 text-sm text-muted">{last ? `Last download: ${new Date(last).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "No download yet in this browser."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Btn kind="primary" onClick={download}>Download backup</Btn>
            <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full border border-line-strong bg-transparent px-5 text-sm font-medium text-fg hover:bg-surface3 sm:min-h-[38px]">
              Restore from file
              <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { void restore(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {msg && <p role="status" className="mt-4 mb-0 text-sm font-medium text-fg">{msg}</p>}
        </Card>

        <Card labelledBy="theme-h">
          <H2 id="theme-h">Appearance</H2>
          <div className="mt-4">
            <Segmented label="Theme" value={theme} onChange={(v) => setTheme(v as Theme)} options={THEMES} />
          </div>
        </Card>

        <Card labelledBy="device-h">
          <H2 id="device-h">Signing out</H2>
          <p className="mt-2 mb-4 text-base text-muted">Sign out of this browser, or of every phone and computer you have used.</p>
          <div className="flex flex-wrap gap-3">
            <Btn kind="outline" onClick={() => signOut("/api/logout")}>Sign out here</Btn>
            <Btn kind="outline" onClick={() => { if (confirm("Sign out of every phone and computer, including this one?")) void signOut("/api/logout-all"); }}>Sign out everywhere</Btn>
          </div>
        </Card>
      </div>
    </>
  );
}
