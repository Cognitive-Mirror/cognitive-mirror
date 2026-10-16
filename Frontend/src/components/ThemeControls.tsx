"use client";

/**
 * Light/dark theme, following the viewer's system until they choose.
 *
 * The theme lives on <html data-theme>. layout.tsx sets it before first paint,
 * so this module only keeps it in step: it follows system changes live while
 * no choice is saved, and a click saves an explicit one.
 */

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "cognitive-mirror-theme";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  listeners.forEach((notify) => notify());
}

function savedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    applyTheme(savedTheme() ?? (media.matches ? "dark" : "light"));
    const follow = (e: MediaQueryListEvent) => {
      if (!savedTheme()) applyTheme(e.matches ? "dark" : "light");
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  return <>{children}</>;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice lasts for this page only */
    }
    applyTheme(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="btn btn-icon theme-switch"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </button>
  );
}
