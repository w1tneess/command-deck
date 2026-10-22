import { useCallback, useState } from "react";

export type Theme = "system" | "dark" | "light";
const KEY = "theme";

const read = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
};

/** "system" leaves data-theme off, so the page follows the device; dark and light force a set. */
export function applyTheme(t: Theme) {
  const style = document.createElement("style");
  style.append(document.createTextNode("*,*::before,*::after{transition:none !important}"));
  document.head.append(style);

  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;

  // Force synchronous style flush so the new theme paints without transition
  void document.body?.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      style.remove();
    });
  });
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(read);
  const choose = useCallback((t: Theme) => {
    setTheme(t);
    applyTheme(t);
    try { localStorage.setItem(KEY, t); } catch { /* private mode: applies until reload */ }
  }, []);
  return [theme, choose] as const;
}
