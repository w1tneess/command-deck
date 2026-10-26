import type { Theme } from "./theme.ts";

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

const ICON: Record<Theme, string> = {
  system: "M4 5h16v11H4z M8 20h8 M12 16v4",
  light: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4L7 17 M17 7l1.4-1.4 M12 8a4 4 0 100 8 4 4 0 000-8z",
  dark: "M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z",
};

/** One tap cycles Auto (follows the device) -> Light -> Dark. */
export function ThemeToggle({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  return (
    <button
      type="button"
      onClick={() => setTheme(NEXT[theme])}
      title={`Theme: ${LABEL[theme]} (click for ${LABEL[NEXT[theme]]})`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}`}
      className="flex size-8 items-center justify-center rounded-full border border-line-strong text-muted hover:text-fg hover:bg-white/[0.06] cursor-pointer"
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICON[theme]} />
      </svg>
    </button>
  );
}
