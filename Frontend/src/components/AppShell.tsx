"use client";

/**
 * The authenticated page frame: top bar, navigation, session guard, and the
 * small primitives every page uses. This is the only place navigation is defined.
 *
 * The guard is a convenience, not security: the backend enforces every role
 * rule. It only keeps people from landing on a screen that would 403.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  BookOpenText,
  CircleAlert,
  FileCheck2,
  LayoutDashboard,
  Library,
  Loader2,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeControls";
import { MirrorMark } from "@/components/explain/Mirror";
import { ROLE_HOME, ROLE_LABEL, type RoleId } from "@/lib/auth";
import { useResource } from "@/lib/useResource";
import { ApiError, type Me } from "@/services/api";
import { logOut } from "@/services/authService";
import { activePersona } from "@/services/demo";
import { loadSession } from "@/services/session";

const NAV: Record<RoleId, { label: string; href: string; icon: LucideIcon }[]> = {
  learner: [
    { label: "Overview", href: "/learner", icon: LayoutDashboard },
    { label: "Learning journey", href: "/learner/learn", icon: BookOpenText },
    { label: "Workplace evidence", href: "/learner/evidence", icon: FileCheck2 },
  ],
  manager: [
    { label: "Team", href: "/manager", icon: UsersRound },
    { label: "Evidence to validate", href: "/manager/evidence", icon: ShieldCheck },
    { label: "Open answers", href: "/manager/answers", icon: MessageSquareText },
  ],
  admin: [{ label: "Governance", href: "/admin", icon: Library }],
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
      <main className="grid min-h-screen place-items-center">
        <Loading label="Checking your session…" />
      </main>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 rule-b" style={{ background: "var(--bg)" }}>
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={ROLE_HOME[role]} className="flex items-center gap-2.5">
            <MirrorMark />
            <span className="text-[1.0625rem] font-medium tracking-[-0.01em] t-fg">Cognitive Mirror</span>
            <span className="hidden text-sm t-subtle-fg sm:inline">· {ROLE_LABEL[role]}</span>
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <ProfileMenu me={me} />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[232px_1fr] lg:gap-10 lg:py-10">
        <nav aria-label="Workspace" className="flex gap-1 overflow-x-auto lg:block lg:space-y-0.5">
          {NAV[role].map(({ label, href, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active === href ? "page" : undefined}
              className="nav-item shrink-0"
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
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
        className="btn btn-icon"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="avatar">{initials(name)}</span>
      </button>
      {open && (
        <div role="menu" className="profile-menu">
          <div className="profile-menu-heading">
            <p>{name}</p>
            <span>
              {me.email} · {ROLE_LABEL[me.role]}
              {activePersona() ? " · demo persona" : ""}
            </span>
          </div>
          <button role="menuitem" onClick={() => void signOut()}>
            <LogOut />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// --- Page primitives -------------------------------------------------------------

/** Inputs, selects and textareas share one look. */
export const fieldClass = "field";
export const fieldStyle = {} as const;

export function PageIntro({
  title,
  text,
  actions,
}: {
  /** Retained for call-site compatibility; headings carry their own weight. */
  eyebrow?: string;
  title: React.ReactNode;
  text: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="display display-lg rise">{title}</h1>
        <p className="lede fade-in mt-4">{text}</p>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`panel p-6 ${className}`}>{children}</section>;
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="note note-error">
      <CircleAlert />
      <div>
        <p>{message}</p>
        {onRetry && (
          <button onClick={onRetry} className="mt-1 font-medium underline">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm t-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

/** Uniform message for any failed request, without leaking raw HTTP noise. */
export function describeError(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status === 403) return "You do not have access to this.";
  return err instanceof Error ? err.message : fallback;
}
