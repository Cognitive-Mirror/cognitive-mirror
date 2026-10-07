"use client";

/**
 * Light/dark theme. The theme lives on <html data-theme>; components read it
 * through useSyncExternalStore so the server render (always dark) and the first
 * client render agree, and every toggle re-renders subscribers.
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
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  listeners.forEach((notify) => notify());
}

function preferredTheme(): Theme {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => applyTheme(preferredTheme()), []);
  return <>{children}</>;
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => "dark" as Theme);
  const isLight = theme === "light";

  const toggle = () => {
    const next: Theme = isLight ? "dark" : "light";
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isLight}
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      onClick={toggle}
      className="theme-toggle"
      title={`${isLight ? "Dark" : "Light"} mode`}
    >
      <Sun className="h-3.5 w-3.5" />
      <span className="theme-toggle-track">
        <span className={`theme-toggle-thumb${isLight ? " is-light" : ""}`} />
      </span>
      <Moon className="h-3.5 w-3.5" />
    </button>
  );
}
