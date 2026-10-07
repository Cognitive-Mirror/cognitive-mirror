"use client";

/**
 * The authenticated page frame: header, sidebar, session guard, and the small
 * primitives every page uses. This is the only place navigation is defined.
 *
 * The guard is a convenience, not security: the backend enforces every role
 * rule. It only keeps people from landing on a screen that would 403.
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CircleAlert, Loader2, LogOut } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeControls";
import { ROLE_HOME, ROLE_LABEL, type RoleId } from "@/lib/auth";
import { useResource } from "@/lib/useResource";
import { ApiError, type Me } from "@/services/api";
import { logOut } from "@/services/authService";
import { loadSession } from "@/services/session";

const NAV: Record<RoleId, { label: string; href: string }[]> = {
  learner: [
    { label: "Overview", href: "/learner" },
    { label: "Learning journey", href: "/learner/learn" },
    { label: "Submit evidence", href: "/learner/evidence" },
  ],
  manager: [
    { label: "Team overview", href: "/manager" },
    { label: "Evidence validation", href: "/manager/evidence" },
    { label: "Open answers", href: "/manager/answers" },
  ],
  admin: [{ label: "Knowledge & retrieval", href: "/admin" }],
};

export function AppShell({
  role,
  active,
  children,
}: {
  /** The area this page belongs to. Users of another role are redirected. */
  role: RoleId;
  active: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const session = useResource(loadSession);
  const me = session.data;

  useEffect(() => {
    if (session.error) router.replace("/");
    else if (me && me.role !== role) router.replace(ROLE_HOME[me.role]);
  }, [session.error, me, role, router]);

  if (!me || me.role !== role) {
    return (
      <main className="grid min-h-screen place-items-center t-bg">
        <Loading label="Checking your session…" />
      </main>
    );
  }

  return (
    <main className="min-h-screen t-bg t-fg">
      <header
        className="sticky top-0 z-20 backdrop-blur-xl"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
      >
        <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-5 lg:px-8">
          <div className="flex items-center gap-2">
            <ProfileMenu me={me} />
            <Link href={ROLE_HOME[role]} className="text-sm font-semibold t-fg">
              Cognitive Mirror
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-8 px-5 py-8 lg:grid-cols-[220px_1fr] lg:px-8">
        <nav aria-label="Workspace">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.18em] t-subtle-fg">
            {ROLE_LABEL[role]} workspace
          </p>
          {NAV[role].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? "page" : undefined}
              className="mb-1 flex rounded-xl px-3 py-2.5 text-sm transition"
              style={
                active === item.href
                  ? { background: "rgba(99,102,241,0.12)", color: "var(--accent-fg)" }
                  : { color: "var(--fg-muted)" }
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
    </main>
  );
}

function ProfileMenu({ me }: { me: Me }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const name = me.display_name || me.email;

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function signOut() {
    await logOut();
    router.replace("/");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="profile-avatar-wrapper"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Image src="/avatar.svg" alt="" width={38} height={38} className="profile-avatar" />
      </button>
      {open && (
        <div role="menu" className="profile-menu">
          <div className="profile-menu-heading">
            <p>{name}</p>
            <span>{ROLE_LABEL[me.role]} account</span>
          </div>
          <button role="menuitem" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// --- Page primitives -------------------------------------------------------------

/** Text inputs, selects and textareas share one look. */
export const fieldClass =
  "w-full rounded-xl px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-indigo-400/30";
export const fieldStyle = {
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--fg)",
} as const;

export function PageIntro({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-bold uppercase tracking-[.18em]" style={{ color: "var(--accent-fg)" }}>
        {eyebrow}
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-.04em] t-fg sm:text-4xl">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 t-muted">{text}</p>
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl p-6 ${className}`}
      style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
    >
      {children}
    </section>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
    >
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-semibold underline underline-offset-2">
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm t-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

/** Uniform message for any failed request, without leaking raw HTTP noise. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) return "You do not have access to this.";
  return err instanceof Error ? err.message : fallback;
}
