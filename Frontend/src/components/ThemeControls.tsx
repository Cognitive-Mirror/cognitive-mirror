"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { LogOut, Moon, Sun, UserRound } from "lucide-react";

const STORAGE_KEY = "cognitive-mirror-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const theme = saved === "light" || saved === "dark" ? saved : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
  }, []);
  return <>{children}</>;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark");
  const toggle = () => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; window.localStorage.setItem(STORAGE_KEY, next); };
  return <button type="button" role="switch" aria-checked={theme === "light"} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={toggle} className="theme-toggle" title={`${theme === "dark" ? "Light" : "Dark"} mode`}><Sun className="h-3.5 w-3.5" /><span className="theme-toggle-track"><span className={`theme-toggle-thumb ${theme === "light" ? "is-light" : ""}`} /></span><Moon className="h-3.5 w-3.5" /></button>;
}

export function ProfileMenu({ role }: { role: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); }; document.addEventListener("mousedown", close); return () => document.removeEventListener("mousedown", close); }, []);
  const switchAccount = () => { window.location.href = "/"; };
  const logOut = () => { window.localStorage.removeItem("cognitive-mirror-theme"); window.location.href = "/"; };
  return <div ref={ref} className="relative"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-haspopup="menu" aria-label="Open profile menu" className="profile-avatar"><Image src="/avatar.svg" alt="Alex Morgan profile" width={38} height={38} /></button>{open && <div role="menu" className="profile-menu"><div className="profile-menu-heading"><p>Alex Morgan</p><span className="capitalize">{role} account</span></div><button role="menuitem" onClick={switchAccount}><UserRound className="h-4 w-4" />Switch Accounts</button><button role="menuitem" onClick={logOut}><LogOut className="h-4 w-4" />Log Out</button></div>}</div>;
}
