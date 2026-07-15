"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LogOut, Moon, Sun, UserRound } from "lucide-react";

const STORAGE_KEY = "cognitive-mirror-theme";

function getInitialTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const theme = getInitialTheme();
    document.documentElement.dataset.theme = theme;
  }, []);
  return <>{children}</>;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Sync with DOM after hydration
  useEffect(() => {
    const current = (document.documentElement.dataset.theme as "light" | "dark") ?? "dark";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  };

  const isLight = theme === "light";

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

export function ProfileMenu({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open profile menu"
        className="profile-avatar"
      >
        <Image src="/avatar.svg" alt="Profile" width={38} height={38} />
      </button>
      {open && (
        <div role="menu" className="profile-menu">
          <div className="profile-menu-heading">
            <p>Alex Morgan</p>
            <span className="capitalize">{role} account</span>
          </div>
          <button role="menuitem" onClick={() => { window.location.href = "/"; }}>
            <UserRound className="h-4 w-4" />
            Switch Accounts
          </button>
          <button role="menuitem" onClick={() => { window.localStorage.removeItem(STORAGE_KEY); window.location.href = "/"; }}>
            <LogOut className="h-4 w-4" />
            Log Out
          </button>
        </div>
      )}
    </div>
  );
}
