import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Scope } from "../server/logic.ts";

export { AppleEmoji, AppleText, AppleEmojiPicker, getAppleEmojiUrl } from "./emoji.tsx";

/** Minimalist SVG Brandmark for Study OS */
export function BrandLogo({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-[3px] bg-bg border border-line shadow-sm overflow-hidden shrink-0 group ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size * 0.72}
        height={size * 0.72}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="transition-transform duration-300 group-hover:scale-105"
      >
        <circle cx="12" cy="12" r="8.5" stroke="#34d399" strokeWidth="1.5" className="opacity-90" />
        <line x1="2" y1="12" x2="22" y2="12" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" className="opacity-80" />
        <circle cx="12" cy="12" r="2.5" fill="#ffffff" />
        <circle cx="12" cy="12" r="5" stroke="#ffffff" strokeWidth="0.75" strokeDasharray="1.5 2" className="opacity-40" />
      </svg>
    </div>
  );
}

/** Icon paths for the dashboard navigation and actions in clean minimalist 24x24 geometry. */
export const ICONS = {
  today: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  syllabus: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z",
  habits: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  week: "M18 20V10 M12 20V4 M6 20v-6",
  deliverables: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z M9 13l2 2 4-4",
  projects: "M16 18l6-6-6-6 M8 6l-6 6 6 6",
  backup: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  trash: "M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6",
  check: "M20 6L9 17l-5-5",
  more: "M12 12h.01 M19 12h.01 M5 12h.01",
  search: "M21 21l-4.35-4.35M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z",
  zen: "M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zm0 3a6 6 0 1 1-6 6 6 6 0 0 1 6-6z",
  flash: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
  flame: "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
  plus: "M12 5v14 M5 12h14",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 6v6l4 2",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  sliders: "M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6",
} as const;

export function Icon({ d, size = 20, stroke = 1.75, className = "" }: { d: string; size?: number; stroke?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={d} />
    </svg>
  );
}

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const dayOf = (iso: string) => new Date(iso + "T00:00:00Z");
/** "19 Nov" */
export const fmtShort = (iso: string) => dayOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** "19 Nov 2026" */
export const fmtLong = (iso: string) => dayOf(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "Thursday 22 October" */
export function fmtWeekdayDate(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).formatToParts(dayOf(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}
export const daysBetween = (from: string, to: string) => Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 86_400_000);

export function Card({ children, className = "", labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`min-w-0 rounded-3xl bg-surface border border-line p-5 sm:p-6 text-fg ${className}`}
    >
      {children}
    </section>
  );
}

export const H2 = ({ id, children, big = false }: { id?: string; children: ReactNode; big?: boolean }) => (
  <h2 id={id} className={`m-0 font-serif font-semibold tracking-tight text-fg ${big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl"}`}>{children}</h2>
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "ghost" | "outline" };
const BTN = {
  primary: "bg-fg text-bg font-semibold hover:opacity-90 active:scale-[0.98] border border-transparent",
  secondary: "bg-surface2 hover:bg-surface3 text-fg border border-line active:bg-surface3",
  outline: "bg-transparent hover:bg-surface2 text-fg border border-line-strong active:bg-surface3",
  ghost: "bg-transparent hover:bg-surface2 text-muted hover:text-fg border-0",
};

/** Modern ergonomic button with clean styling and tactile feedback. */
export function Btn({ kind = "secondary", className = "", type = "button", ...rest }: BtnProps) {
  return (
    <button
      type={type}
      className={`min-h-[44px] sm:min-h-[38px] shrink-0 rounded-full px-5 sm:px-4 font-sans text-sm font-medium transition-all duration-200 ease-out inline-flex items-center justify-center gap-1.5 enabled:active:scale-[0.98] ${BTN[kind]} ${className}`}
      {...rest}
    />
  );
}

export function Pill({ children, accent = false, className = "" }: { children: ReactNode; accent?: boolean; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-sans text-xs font-medium ${accent ? "bg-accent/15 text-accent" : "bg-surface3 text-muted"} ${className}`}>{children}</span>
  );
}

/** High-contrast, clean geometric milestone badge. */
export function ScopeTag({ scope, className = "" }: { scope: Scope; className?: string }) {
  const label: Record<Scope, string> = { unit1: "Unit 1", unit2: "Unit 2", pb1: "Pre-Boards 1", pb2: "Pre-Boards 2", board: "Boards" };
  return (
    <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${scope === "board" ? "bg-fg text-bg" : "bg-surface3 text-muted"} ${className}`}>
      {label[scope] ?? scope}
    </span>
  );
}

export function ConfDots({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`Confidence ${value} of 5`} className="flex gap-1.5 items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`size-2 rounded-full transition-all duration-150 ${
            n <= value ? "bg-accent" : "bg-line-strong"
          }`}
        />
      ))}
    </span>
  );
}

export const PASS_NAMES = ["Concept", "PYQs", "Sample papers"] as const;
export const PASS_SHORT = ["Concept", "PYQs", "Sample"] as const;

/** Read-only pass pills. */
export function PassPills({ passes }: { passes: (string | null)[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {PASS_SHORT.map((name, i) => (
        <span key={name} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${passes[i] ? "bg-accent/15 text-accent" : "bg-surface3 text-muted"}`}>
          {passes[i] ? "✓ " : ""}
          {name}
        </span>
      ))}
    </div>
  );
}

/** 1-Click Interactive Pass Toggles (P1, P2, P3) */
export function PassToggles({
  passes,
  onToggle,
}: {
  passes: (string | null)[];
  onToggle: (passIdx: number) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Revision passes">
      {PASS_SHORT.map((name, i) => {
        const done = !!passes[i];
        return (
          <button
            key={name}
            type="button"
            aria-pressed={done}
            title={`Toggle Pass ${i + 1}: ${PASS_NAMES[i]}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(i);
            }}
            className={`min-h-[32px] min-w-[44px] rounded-full px-3 text-xs font-semibold active:scale-95 ${done ? "bg-accent/15 text-accent" : "bg-surface3 text-muted hover:text-fg"}`}
          >
            {done ? "✓ " : ""}P{i + 1}
          </button>
        );
      })}
    </div>
  );
}

/** Precision rounded circular checkbox with emerald check indicator. */
export const Check = ({ on }: { on: boolean }) => (
  <span className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-150 text-xs ${on ? "border-accent bg-accent text-accent-text font-bold" : "border-line-strong bg-transparent text-transparent hover:border-muted"}`}>
    {on && "✓"}
  </span>
);

export interface SubjectPastel {
  bg: string;
  text: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  code: string;
  hex: string;
  category: "maths" | "science" | "sst" | "lang_it";
}

/**
 * Pastel Subject Palette Mapping:
 * - Mathematics: Soft Peach / Coral (`bg-[#fdd5cc] text-zinc-800 border border-orange-200/40 paper`)
 * - Science: Soft Lavender (`bg-[#ded9fd] text-zinc-800 border border-indigo-200/40 paper`)
 * - Social Science: Warm Honey Cream (`bg-[#fee2be] text-zinc-800 border border-warn/30 paper`)
 * - Languages & IT: Mint / Celadon (`bg-[#c8f0d8] text-zinc-800 border border-accent/30 paper`)
 */
export function getSubjectPastel(subjectId: string): SubjectPastel {
  const id = subjectId.toLowerCase();
  if (id === "maths" || id.includes("math")) {
    return {
      bg: "bg-[#fdd5cc] paper",
      text: "text-zinc-800",
      border: "border-orange-200/40",
      badgeBg: "bg-white/80",
      badgeText: "text-orange-950",
      code: "MATH-041",
      hex: "#fdd5cc",
      category: "maths",
    };
  }
  if (id === "physics" || id === "chemistry" || id === "biology" || id === "science") {
    return {
      bg: "bg-[#ded9fd] paper",
      text: "text-zinc-800",
      border: "border-indigo-200/40",
      badgeBg: "bg-white/80",
      badgeText: "text-indigo-950",
      code: id === "physics" ? "PHY-086" : id === "chemistry" ? "CHEM-086" : id === "biology" ? "BIO-086" : "SCI-086",
      hex: "#ded9fd",
      category: "science",
    };
  }
  if (id === "history" || id === "civics" || id === "geography" || id === "economics" || id === "political-science" || id === "sst") {
    return {
      bg: "bg-[#fee2be] paper",
      text: "text-zinc-800",
      border: "border-warn/30",
      badgeBg: "bg-white/80",
      badgeText: "text-amber-950",
      code: "SST-087",
      hex: "#fee2be",
      category: "sst",
    };
  }
  return {
    bg: "bg-[#c8f0d8] paper",
    text: "text-zinc-800",
    border: "border-accent/30",
    badgeBg: "bg-white/80",
    badgeText: "text-emerald-950",
    code: id.includes("it") ? "IT-402" : id.includes("eng") ? "ENG-184" : id.includes("beng") ? "BEN-005" : "LANG-102",
    hex: "#c8f0d8",
    category: "lang_it",
  };
}

export const GROUPS = [
  { label: "Maths", ids: ["maths"] },
  { label: "Science", ids: ["physics", "chemistry", "biology", "science"] },
  { label: "Social Science", ids: ["history", "civics", "geography", "economics", "political-science"] },
  { label: "English", ids: ["english"] },
  { label: "Bengali", ids: ["bengali", "hindi"] },
  { label: "Information Technology", ids: ["it", "ai"] },
];

/** Minimalist SVG subject icons in pure vector line geometry */
export const SUBJECT_SVGS: Record<string, { color: string; bg: string; border: string; svg: ReactNode }> = {
  maths: {
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <circle cx="12" cy="5" r="2" />
        <path d="M10.5 7L4 21 M13.5 7L20 21 M7 15h10 M12 10v3" />
      </svg>
    ),
  },
  physics: {
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.2 2.2 M16.9 16.9l2.2 2.2 M4.9 19.1l2.2-2.2 M16.9 7.1l2.2-2.2" />
      </svg>
    ),
  },
  chemistry: {
    color: "text-accent",
    bg: "bg-accent/15",
    border: "border-accent/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M10 2v5.5L5.2 16.6A3 3 0 0 0 7.8 21h8.4a3 3 0 0 0 2.6-4.4L14 7.5V2h-4z" />
        <path d="M8.5 2h7 M7 16h10" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
  biology: {
    color: "text-lime-400",
    bg: "bg-lime-500/10",
    border: "border-lime-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M12 22C6.5 22 2 17.5 2 12S6.5 2 12 2s10 4.5 10 10-4.5 10-10 10z" strokeDasharray="3 3" />
        <path d="M12 2a10 10 0 0 0 0 20 M2 12h20" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    ),
  },
  science: {
    color: "text-accent",
    bg: "bg-accent/15",
    border: "border-accent/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M10 2v5.5L5.2 16.6A3 3 0 0 0 7.8 21h8.4a3 3 0 0 0 2.6-4.4L14 7.5V2h-4z" />
        <path d="M8.5 2h7 M7 16h10" />
        <circle cx="12" cy="11" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  history: {
    color: "text-warn",
    bg: "bg-warn/15",
    border: "border-warn/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M4 4h16 M4 20h16 M5 8h14 M7 8v12 M12 8v12 M17 8v12 M12 2l8 3H4l8-3z" />
      </svg>
    ),
  },
  civics: {
    color: "text-warn",
    bg: "bg-warn/15",
    border: "border-warn/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M12 3v18 M8 21h8 M4 7h16 M4 7l-2 6a3 3 0 0 0 6 0L6 7 M20 7l-2 6a3 3 0 0 0 6 0L22 7" />
      </svg>
    ),
  },
  geography: {
    color: "text-warn",
    bg: "bg-warn/15",
    border: "border-warn/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.6 9h16.8 M3.6 15h16.8 M11.5 3a15.3 15.3 0 0 0 0 18 M12.5 3a15.3 15.3 0 0 1 0 18" />
      </svg>
    ),
  },
  "political-science": {
    color: "text-warn",
    bg: "bg-warn/15",
    border: "border-warn/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M12 3v18 M8 21h8 M4 7h16 M4 7l-2 6a3 3 0 0 0 6 0L6 7 M20 7l-2 6a3 3 0 0 0 6 0L22 7" />
      </svg>
    ),
  },
  economics: {
    color: "text-warn",
    bg: "bg-warn/15",
    border: "border-warn/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M3 3v18h18 M18 9l-5 5-4-4-6 6 M14 9h4v4" />
      </svg>
    ),
  },
  english: {
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M12 19l7-7 3 3-7 7-3-3z M18 13l-1.5-7.5L2 2l3.5 14.5L13 18 M2 2l7.586 7.586" />
        <circle cx="11" cy="11" r="1.5" />
      </svg>
    ),
  },
  bengali: {
    color: "text-purple-400",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M4 4h16 M16 4v16 M10.5 12h5.5 M10.5 6a3 3 0 0 0-3 3c0 1.5 1.5 2.5 3 3 M10.5 12c-1.8.5-3.5 1.8-3.5 3.8a3.5 3.5 0 0 0 3.8 3.2" />
      </svg>
    ),
  },
  hindi: {
    color: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/30",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <path d="M4 4h16 M16 4v16 M10.5 12h5.5 M10.5 6a3 3 0 0 0-3 3c0 1.5 1.5 2.5 3 3 M10.5 12c-1.8.5-3.5 1.8-3.5 3.8a3.5 3.5 0 0 0 3.8 3.2" />
      </svg>
    ),
  },
  it: {
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M7 20h10 M12 16v4 M8 9l2 2-2 2 M12 12h4" />
      </svg>
    ),
  },
  ai: {
    color: "text-teal-400",
    bg: "bg-teal-500/10",
    border: "border-teal-500/20",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
        <rect x="5" y="5" width="14" height="14" rx="2" />
        <rect x="9" y="9" width="6" height="6" rx="1" />
        <path d="M9 1v4 M15 1v4 M9 19v4 M15 19v4 M1 9h4 M1 15h4 M19 9h4 M19 15h4" />
      </svg>
    ),
  },
};

/** Minimalist SVG Subject Icon */
export function SubjectIcon({ id, size = 18, className = "" }: { id: string; size?: number; className?: string }) {
  const conf = SUBJECT_SVGS[id];
  const pastel = getSubjectPastel(id);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${pastel.bg} ${pastel.border} border p-1 ${className}`}
      style={{ width: size + 10, height: size + 10 }}
      aria-hidden="true"
    >
      <span className={pastel.text} style={{ width: size, height: size }}>
        {conf?.svg ?? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="size-full">
            <circle cx="12" cy="12" r="9" />
          </svg>
        )}
      </span>
    </span>
  );
}

/** Minimalist SVG Subject Badge with label */
export function SubjectBadge({ id, label, className = "" }: { id: string; label?: string; className?: string }) {
  const conf = SUBJECT_SVGS[id];
  const pastel = getSubjectPastel(id);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-sans text-xs font-semibold ${pastel.bg} ${pastel.border} ${pastel.text} ${className}`}>
      {conf?.svg && <span className="size-3 shrink-0">{conf.svg}</span>}
      <span>{label ?? id}</span>
    </span>
  );
}

/** One page header for every screen: eyebrow, title, optional line of help, and actions on the right. */
export function PageHeader({ eyebrow, title, sub, children }: { eyebrow?: string; title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
      <div className="min-w-0">
        {eyebrow && <div className="text-xs font-medium text-muted">{eyebrow}</div>}
        <h1 className="m-0 mt-1 text-2xl sm:text-[28px] font-semibold tracking-tight text-fg">{title}</h1>
        {sub && <p className="m-0 mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </header>
  );
}

/** A short either/or choice (view, scope). Buttons with aria-pressed, so it reads as a group of toggles. */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-surface3 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-9 whitespace-nowrap rounded-full border-0 px-4 text-sm font-medium cursor-pointer ${value === v ? "bg-surface text-fg shadow-sm" : "bg-transparent text-muted hover:text-fg"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
