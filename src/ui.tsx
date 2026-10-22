import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Icon paths are the ones in the design. */
export const ICONS = {
  today: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  syllabus: "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z",
  week: "M18 20V10 M12 20V4 M6 20v-6",
  deliverables: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M8 2h8v4H8z",
  backup: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v5 M14 11v5",
  check: "M5 12l5 5L20 7",
} as const;

export function Icon({ d, size = 20, stroke = 2 }: { d: string; size?: number; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
/** "Thursday 22 October" (no comma, as in the design) */
export function fmtWeekdayDate(iso: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).formatToParts(dayOf(iso)).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}
export const daysBetween = (from: string, to: string) => Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 86_400_000);

export function Card({ children, className = "", labelledBy }: { children: ReactNode; className?: string; labelledBy?: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`min-w-0 rounded-2xl border border-line bg-surface px-4 py-4 lg:px-6 lg:py-5 ${className}`}>
      {children}
    </section>
  );
}

export const H2 = ({ id, children, big = false }: { id?: string; children: ReactNode; big?: boolean }) => (
  <h2 id={id} className={`m-0 font-semibold ${big ? "text-xl" : "text-[17px]"}`}>{children}</h2>
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: "primary" | "secondary" | "ghost" | "outline" };
const BTN = {
  primary: "bg-accent text-ink font-semibold border-0",
  secondary: "bg-surface2 text-fg border border-line",
  outline: "bg-transparent text-fg border border-line",
  ghost: "bg-transparent text-muted border-0",
};
/** 44px minimum touch target, as in the design. */
export function Btn({ kind = "secondary", className = "", type = "button", ...rest }: BtnProps) {
  return <button type={type} className={`h-11 shrink-0 rounded-xl px-4 text-[14px] ${BTN[kind]} ${className}`} {...rest} />;
}

export function Pill({ children, accent = false, className = "" }: { children: ReactNode; accent?: boolean; className?: string }) {
  return (
    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${accent ? "border-accent bg-accent text-ink" : "border-line bg-surface2 text-muted"} ${className}`}>{children}</span>
  );
}

export function ConfDots({ value }: { value: number }) {
  return (
    <span role="img" aria-label={`Confidence ${value} of 5`} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => <span key={n} className={`size-2 rounded-full ${n <= value ? "bg-blue" : "bg-line"}`} />)}
    </span>
  );
}

export const PASS_NAMES = ["Concept", "PYQs", "Sample papers"] as const;
export const PASS_SHORT = ["Concept", "PYQs", "Sample"] as const;

/** Read-only pass pills (the queue). */
export function PassPills({ passes }: { passes: (string | null)[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PASS_NAMES.map((name, i) => (
        <span key={name} className={`rounded-full border px-2.5 py-[3px] text-xs ${passes[i] ? "border-good text-good" : "border-line text-muted"}`}>{passes[i] ? "✓ " : ""}{name}</span>
      ))}
    </div>
  );
}

/** 22px on a phone, 24px on a wide screen, as in the design. */
export const Check = ({ on }: { on: boolean }) => (
  <span className={`flex size-[22px] items-center justify-center rounded-[7px] border-2 text-ink lg:size-6 lg:rounded-lg ${on ? "border-accent bg-accent" : "border-muted"}`}>
    {on && <Icon d={ICONS.check} size={14} stroke={3} />}
  </span>
);

/** Science and Social Science are shown as groups of their subjects, as in the design. */
export const GROUPS: { label: string; ids: string[] }[] = [
  { label: "Mathematics", ids: ["maths"] },
  { label: "Science", ids: ["physics", "chemistry", "biology"] },
  { label: "Social Science", ids: ["history", "civics", "geography", "economics"] },
  { label: "English", ids: ["english"] },
  { label: "Bengali", ids: ["bengali"] },
  { label: "Hindi", ids: ["hindi"] },
  { label: "Information Technology", ids: ["it"] },
];
