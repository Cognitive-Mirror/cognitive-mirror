"use client";

/**
 * Sign-in screen: the product's argument on the left, the sign-in card on the
 * right.
 *
 * Firebase proves who someone is; the role - and so the landing page - comes
 * from the backend afterwards (GET /auth/me). A new Google account is always
 * provisioned as a learner. Quick test access (development only) acts as a
 * seeded demo persona instead, which the backend confines to the demo tenant.
 */

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, GraduationCap, Library, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LevelAxis, MirrorMark } from "@/components/explain/Mirror";
import { DEMO_ACCOUNTS, ROLE_HOME, ROLE_LABEL, type RoleId } from "@/lib/auth";
import { resetPassword, signInWithEmail, signInWithGoogle } from "@/services/authService";
import { type DemoPersona, getPersonas, setPersona } from "@/services/demo";
import { clearSession, loadSession } from "@/services/session";

/* ── The argument ─────────────────────────────────────────────────── */

const EASE = [0.16, 1, 0.3, 1] as const;
const STOPS = ["Novice", "Developing", "Competent", "Proficient", "Expert"];

/** An illustrative Mirror that plays the mechanism once: knowing fills, doing waits for a manager. */
function MirrorStory() {
  const reduce = useReducedMotion();
  const [validated, setValidated] = useState(!!reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setValidated(true), 2600);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <figure className="w-full max-w-[30rem]">
      <figcaption className="meta mb-5 flex items-center justify-between">
        <span>Stakeholder influence · one learner</span>
        <span>Illustrative</span>
      </figcaption>

      <div className="grid grid-cols-[4.5rem_1fr_4rem] items-center gap-x-4">
        <span className="caption">Knows</span>
        <div className="h-3 overflow-hidden" style={{ background: "var(--field-line)" }}>
          <motion.div
            className="h-full"
            style={{ background: "var(--knows)", transformOrigin: "left" }}
            initial={reduce ? false : { scaleX: 0 }}
            animate={{ scaleX: 0.88 }}
            transition={{ duration: 1.4, ease: EASE, delay: 0.3 }}
          />
        </div>
        <span className="num ink-knows text-right text-sm font-semibold">88%</span>
      </div>

      <div className="grid grid-cols-[4.5rem_1fr_4rem] gap-x-4 py-3">
        <span />
        <div className="h-px" style={{ background: "var(--ink-3)" }} />
        <span />
      </div>

      <div className="grid grid-cols-[4.5rem_1fr_4rem] items-start gap-x-4">
        <span className="caption pt-0.5">Does</span>
        <div>
          <div className="relative flex h-4 items-center justify-between">
            <div className="absolute left-2 right-2 top-1/2 h-px -translate-y-1/2" style={{ background: "var(--line-strong)" }} />
            <motion.div
              className="absolute left-2 top-1/2 h-[3px] -translate-y-1/2"
              style={{ background: "var(--does)", transformOrigin: "left", width: "calc(25% - 4px)" }}
              initial={false}
              animate={{ scaleX: validated ? 1 : 0 }}
              transition={{ duration: 0.8, ease: EASE }}
            />
            {STOPS.map((s, i) => {
              const on = validated && i <= 1;
              return (
                <span
                  key={s}
                  className="relative z-10 block h-4 w-4"
                  style={{
                    border: "2px solid",
                    background: on ? "var(--does)" : "var(--bg)",
                    borderColor: on ? "var(--does)" : "var(--line-strong)",
                    transition: "background-color .4s ease, border-color .4s ease",
                    transitionDelay: on ? `${0.35 + i * 0.15}s` : "0s",
                    boxShadow: i === 3 ? "0 0 0 3px var(--bg), 0 0 0 4.5px var(--ink)" : undefined,
                  }}
                />
              );
            })}
          </div>
          <LevelAxis required={3} />
        </div>
        <span className="num ink-does pt-0.5 text-right text-sm font-semibold">
          {validated ? "0.85" : "0.00"}
        </span>
      </div>

      <motion.p
        className="meta mt-6"
        initial={false}
        animate={{ opacity: 1 }}
        key={validated ? "after" : "before"}
      >
        {validated
          ? "A manager validated one piece of workplace evidence. Level and confidence moved."
          : "Assessments filled the top bar. The level below has not moved: nobody has seen it at work."}
      </motion.p>
    </figure>
  );
}

const PRINCIPLES: [string, string][] = [
  ["Assessments measure what people know.", "var(--knows)"],
  ["Managers validate what they do.", "var(--does)"],
  ["AI reviews against the approved rubric, and every change is audited.", "var(--pending)"],
];

export function BrandSection() {
  return (
    <section className="relative hidden min-h-screen flex-col justify-between px-12 py-10 lg:flex lg:w-[56%] xl:px-20" style={{ background: "var(--field)" }}>
      <div className="flex items-center gap-2.5">
        <MirrorMark size={26} />
        <span className="text-lg font-medium tracking-[-0.01em] t-fg">Cognitive Mirror</span>
      </div>

      <div className="max-w-[36rem]">
        <h1 className="display display-xl">
          Knowing <em>isn&rsquo;t</em> doing.
        </h1>
        <p className="lede mt-6 text-[1.0625rem]">
          Cognitive Mirror keeps two readings for every capability: what a person has shown they
          know, and what their manager has seen them do at work. Only the second moves their level.
        </p>
        <div className="mt-12">
          <MirrorStory />
        </div>
      </div>

      <ul className="grid max-w-[36rem] grid-cols-3 gap-6 text-[13px] leading-5 t-muted">
        {PRINCIPLES.map(([text, color]) => (
          <li key={text} className="pt-3" style={{ borderTop: "1px solid var(--field-line)" }}>
            <span aria-hidden className="mb-3 block h-2.5 w-2.5" style={{ background: color }} />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── Quick test access ───────────────────────────────────────────── */

const QUICK: { role: RoleId; key: string; icon: LucideIcon }[] = [
  { role: "learner", key: "priya", icon: GraduationCap },
  { role: "manager", key: "dev", icon: ShieldCheck },
  { role: "admin", key: "sarah", icon: Library },
];

function QuickAccess() {
  const router = useRouter();
  const [personas, setPersonas] = useState<DemoPersona[] | null>(null);

  useEffect(() => {
    // 404 outside development: the section simply never appears.
    getPersonas()
      .then((r) => setPersonas(r.personas))
      .catch(() => setPersonas(null));
  }, []);

  if (!personas) return null;

  function enter(email: string, role: RoleId) {
    setPersona(email);
    router.push(ROLE_HOME[role]);
  }

  return (
    <section className="mt-8 rule pt-6" aria-labelledby="quick-access">
      <h2 id="quick-access" className="title">Quick test access</h2>
      <p className="meta mt-1">Development only. Opens the workspace directly as a demo person, no password.</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {QUICK.map(({ role, key, icon: Icon }) => {
          const p = personas.find((x) => x.key === key);
          if (!p) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => enter(p.email, role)}
              className="btn btn-neutral h-auto flex-col items-start gap-1 px-3 py-3 text-left"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Icon className="ink-primary" /> {ROLE_LABEL[role]}
              </span>
              <span className="meta font-normal">{p.display_name}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── Sign-in card ─────────────────────────────────────────────────── */

type Feedback = { tone: "error" | "info"; text: string } | null;

/** Firebase error codes, in words a person can act on. */
function signInMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
    return "That email and password do not match an account.";
  }
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a moment and try again.";
  if (code === "auth/popup-closed-by-user") return "Google sign-in was closed before it finished.";
  return err instanceof Error ? err.message : "Sign-in failed.";
}

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);

  async function run(signIn: () => Promise<unknown>) {
    setFeedback(null);
    setBusy(true);
    try {
      await signIn();
      clearSession();
      const me = await loadSession();
      // A new account is a learner; an admin-created record carries its role.
      router.push(ROLE_HOME[me.role]);
    } catch (err) {
      setFeedback({ tone: "error", text: signInMessage(err) });
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      setFeedback({ tone: "info", text: "Enter your email first, then choose Forgot password." });
      return;
    }
    try {
      await resetPassword(email);
      setFeedback({ tone: "info", text: `If ${email} has an account, a reset link is on its way.` });
    } catch (err) {
      setFeedback({ tone: "error", text: signInMessage(err) });
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(() => signInWithEmail(email, password));
  };

  return (
    <div className="w-full">
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <MirrorMark size={24} />
        <span className="text-lg font-medium t-fg">Cognitive Mirror</span>
      </div>

      <h2 className="text-[2rem] font-normal leading-tight tracking-[-0.01em] t-fg">Sign in</h2>
      <p className="mt-2 text-base t-muted">to continue to Cognitive Mirror</p>

      <form className="mt-8 space-y-5" onSubmit={onSubmit}>
        <div>
          <label htmlFor="login-email" className="field-label">Email</label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="field h-12"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="text-[13px] font-medium t-fg">Password</label>
            <button type="button" onClick={() => void forgotPassword()} className="text-[13px] font-medium ink-primary hover:underline">
              Forgot password?
            </button>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field h-12"
          />
        </div>

        {feedback && (
          <p role={feedback.tone === "error" ? "alert" : "status"} className={`note ${feedback.tone === "error" ? "note-error" : "note-info"}`}>
            {feedback.text}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn btn-primary btn-lg btn-block">
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
          <span className="meta">or</span>
          <span className="h-px flex-1" style={{ background: "var(--line)" }} />
        </div>

        <button type="button" onClick={() => void run(signInWithGoogle)} disabled={busy} className="btn btn-neutral btn-lg btn-block">
          <GoogleG /> Continue with Google
        </button>
        <p className="meta text-center">New Google accounts start as learners. An admin assigns manager and admin roles.</p>
      </form>

      <QuickAccess />

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowAccounts((v) => !v)}
          aria-expanded={showAccounts}
          className="btn btn-text -ml-3"
        >
          Fill a Firebase demo account
          <ChevronDown className={`transition-transform ${showAccounts ? "rotate-180" : ""}`} />
        </button>
        {showAccounts && (
          <div className="mt-2 rows panel">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  setFeedback(null);
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[var(--surface)]"
              >
                <span className="text-sm font-medium t-fg">{ROLE_LABEL[account.role]}</span>
                <span className="meta">{account.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
