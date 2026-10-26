import { useSyncExternalStore } from "react";
import { ICONS } from "./ui.tsx";

/** Four places to go. Plan and Life hold sub-pages (shown as tabs under the header); old #hashes still work. */
export const GROUPS = [
  { id: "today", label: "Today", icon: ICONS.home, pages: [{ id: "today", label: "Today" }, { id: "overview", label: "Overview" }] },
  { id: "study", label: "Study", icon: ICONS.syllabus, pages: [{ id: "syllabus", label: "Syllabus" }] },
  { id: "plan", label: "Plan", icon: ICONS.clock, pages: [{ id: "schedule", label: "Schedule" }, { id: "deliverables", label: "Due dates" }, { id: "week", label: "Review" }] },
  { id: "life", label: "Life", icon: ICONS.habits, pages: [{ id: "habits", label: "Habits" }, { id: "projects", label: "Projects" }, { id: "routine", label: "Routine" }] },
] as const;
export type Page = (typeof GROUPS)[number]["pages"][number]["id"] | "backup";
export const groupOf = (page: Page) => GROUPS.find((g) => (g.pages as readonly { id: string }[]).some((p) => p.id === page));


const ALL_PAGES: Page[] = [...GROUPS.flatMap((g) => g.pages.map((p) => p.id as Page)), "backup"];

/** `#syllabus?view=matrix&subject=maths` -> the page plus its params. Anything unknown opens Today. */
export function parseHash(hash: string): { page: Page; params: URLSearchParams } {
  const [name, query = ""] = hash.replace(/^#/, "").split("?");
  return { page: ALL_PAGES.find((id) => id === name) ?? "today", params: new URLSearchParams(query) };
}

/** Re-renders on every hash change, so back, forward and reload all restore the same screen. */
export const useHash = () => useSyncExternalStore(
  (cb) => { window.addEventListener("hashchange", cb); return () => window.removeEventListener("hashchange", cb); },
  () => location.hash,
);

/** Change a page's params (null drops one) and keep the rest. Each change is a history entry, so Back undoes it. */
export function setHashParams(page: Page, patch: Record<string, string | null>) {
  const { params } = parseHash(location.hash);
  for (const [k, v] of Object.entries(patch)) v === null ? params.delete(k) : params.set(k, v);
  const q = params.toString();
  location.hash = q ? `${page}?${q}` : page;
}
