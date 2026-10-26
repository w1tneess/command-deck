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

