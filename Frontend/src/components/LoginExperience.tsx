"use client";

/**
 * Sign-in screen: brand panel and login card.
 *
 * Firebase proves who someone is; the role - and so the landing page - comes
 * from the backend afterwards (GET /auth/me). Nothing here lets the user pick a
 * role.
 */

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown, KeyRound, LockKeyhole, Mail, Sparkles } from "lucide-react";

import { DEMO_ACCOUNTS, ROLE_HOME, ROLE_LABEL } from "@/lib/auth";
import { resetPassword, signInWithEmail, signInWithGoogle } from "@/services/authService";
import { clearSession, loadSession } from "@/services/session";

/* ── 1. Background animation (decorative SVG + particles) ── */
const PARTICLES = [
  { top: "10%", left: "22%", delay: 0.1 },
  { top: "25%", left: "55%", delay: 0.4 },
  { top: "60%", left: "38%", delay: 0.7 },
  { top: "80%", left: "72%", delay: 1.0 },
];

function BackgroundAnimation() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* gradient blobs */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.14),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.12),transparent_38%)]" />
      <motion.div
        animate={reduce ? undefined : { y: [-8, 8, -8], x: [0, 6, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[8%] top-[6%] h-48 w-48 rounded-full blur-3xl"
        style={{ background: "rgba(99,102,241,0.07)" }}
      />
      <motion.div
        animate={reduce ? undefined : { y: [10, -8, 10] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[8%] right-[6%] h-64 w-64 rounded-full blur-3xl"
        style={{ background: "rgba(99,102,241,0.09)" }}
      />
      {/* network lines */}
      <svg className="absolute inset-0 h-full w-full opacity-25" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ns" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.5)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.2)" />
          </linearGradient>
        </defs>
        <path d="M10,30 C25,42 40,38 55,45 S75,38 90,50" stroke="url(#ns)" strokeWidth="0.3" fill="none" />
        <path d="M15,65 C30,55 45,60 60,55 S78,65 92,72" stroke="url(#ns)" strokeWidth="0.3" fill="none" />
      </svg>
      {/* particles */}
      {PARTICLES.map((p) => (
        <motion.span
          key={`${p.top}-${p.left}`}
          animate={reduce ? undefined : { opacity: [0.2, 0.7, 0.2], scale: [1, 1.4, 1] }}
          transition={{ duration: 4, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          className="absolute h-1.5 w-1.5 rounded-full bg-indigo-400/60"
          style={{ top: p.top, left: p.left }}
        />
      ))}
    </div>
  );
}

/* ── Floating node chips — positioned away from the text block ── */
const NODES = [
  { label: "Capability", top: "8%", left: "10%" },
  { label: "AI Review", top: "16%", left: "55%" },
  { label: "Evidence", top: "72%", left: "8%" },
  { label: "Validation", top: "80%", left: "58%" },
];

function FloatingNodes() {
  const reduce = useReducedMotion();
  return (
    <>
      {NODES.map((node, i) => (
        <motion.div
          key={node.label}
          animate={reduce ? undefined : { y: [0, i % 2 === 0 ? -7 : 7, 0] }}
          transition={{ duration: 7 + i * 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute"
          style={{ top: node.top, left: node.left }}
        >
          <div className="node-chip">{node.label}</div>
        </motion.div>
      ))}
    </>
  );
}

/* ── 2. BrandSection ── */
export function BrandSection() {
  return (
    <section className="brand-panel relative hidden min-h-screen lg:flex lg:w-[54%] lg:flex-col">
      <BackgroundAnimation />

      {/* Top logo bar */}
      <div className="relative z-10 flex items-center gap-3 px-10 pt-10 xl:px-14 xl:pt-12">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl"
          style={{ border: "1px solid var(--border-md)", background: "var(--bg-subtle)" }}
        >
          <Sparkles className="h-5 w-5" style={{ color: "var(--accent-fg)" }} />
        </div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--fg)" }}>
            Cognitive Mirror
          </p>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Enterprise Capability Intelligence Platform
          </p>
        </div>
      </div>

      {/* Centre content — clear of floating nodes */}
      <div className="relative z-10 flex flex-1 flex-col justify-center px-10 xl:px-14">
        {/* floating nodes render behind this block */}
        <FloatingNodes />

        <div className="relative z-10 max-w-md space-y-6 rounded-3xl py-6">
          <div
            className="inline-flex items-center rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.28em]"
            style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
          >
            Capability Intelligence
          </div>
          <h1
            className="text-5xl font-semibold leading-[1.04] tracking-[-0.05em] xl:text-6xl"
            style={{ color: "var(--fg)" }}
          >
            Cognitive Mirror
          </h1>
          <p className="text-xl leading-8 tracking-[-0.02em]" style={{ color: "var(--fg-muted)" }}>
            Measure Capability. Validate Growth.
          </p>
          <p className="text-base leading-8" style={{ color: "var(--fg-muted)" }}>
            A premium operating layer for capability discovery, learning evidence,
            AI-assisted review, and manager validation across the enterprise.
          </p>
        </div>
      </div>

      {/* Bottom feature cards */}
      <div className="relative z-10 grid grid-cols-3 gap-4 px-10 pb-10 xl:px-14 xl:pb-12">
        {[
          "Capability pathways with clear evidence loops",
          "Structured AI review designed for human trust",
          "Validation signals for managers and leaders",
        ].map((item) => (
          <div
            key={item}
            className="rounded-2xl p-4 text-sm leading-6"
            style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── 3. Demo accounts ── */
function DemoAccounts({ onSelect }: { onSelect: (email: string, password: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="demo-panel">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ borderRadius: isOpen ? "1rem 1rem 0 0" : "1rem" }}
      >
        <span className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl"
            style={{ border: "1px solid var(--border)", background: "var(--bg-input)" }}
          >
            <KeyRound className="h-4 w-4" style={{ color: "var(--fg)" }} />
          </span>
          <span>
            <span className="block text-sm font-medium" style={{ color: "var(--fg)" }}>Demo accounts</span>
            <span className="block text-xs" style={{ color: "var(--fg-muted)" }}>One click fills the form</span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--fg-muted)" }}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <div className="space-y-2 p-4">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => onSelect(account.email, account.password)}
                  className="demo-panel-row"
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                    {ROLE_LABEL[account.role]}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--fg-muted)" }}>{account.email}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── 4. Login card ── */
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

export function LoginCard() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);

  async function run(signIn: () => Promise<unknown>) {
    setFeedback(null);
    setBusy(true);
    try {
      await signIn();
      clearSession();
      const me = await loadSession();
      router.push(ROLE_HOME[me.role]);
    } catch (err) {
      setFeedback({ tone: "error", text: signInMessage(err) });
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      setFeedback({ tone: "info", text: "Enter your email above first." });
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
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="login-card relative w-full max-w-xl overflow-hidden p-6 shadow-[0_32px_80px_rgba(0,0,0,0.25)] sm:p-8"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

      <div className="mb-8">
        <h2 className="text-3xl font-semibold tracking-[-0.04em]" style={{ color: "var(--fg)" }}>
          Welcome back
        </h2>
        <p className="mt-2 text-sm leading-6" style={{ color: "var(--fg-muted)" }}>
          Sign in to continue your capability journey.
        </p>
      </div>

      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium" style={{ color: "var(--fg)" }}>Email</span>
            <span className="relative block">
              <Mail
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--fg-muted)" }}
              />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="login-input pl-11"
              />
            </span>
          </label>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                Password
              </label>
              <button
                type="button"
                onClick={() => void forgotPassword()}
                className="text-xs transition hover:opacity-80"
                style={{ color: "var(--fg-muted)" }}
              >
                Forgot password?
              </button>
            </div>
            <span className="relative block">
              <LockKeyhole
                className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
                style={{ color: "var(--fg-muted)" }}
              />
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="login-input pl-11"
              />
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <motion.button
            type="submit"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.993 }}
            disabled={busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(99,102,241,0.35)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight className="h-4 w-4" />
          </motion.button>

          <div className="flex items-center gap-4">
            <div className="h-px flex-1 divider-line" />
            <span className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--fg-subtle)" }}>or</span>
            <div className="h-px flex-1 divider-line" />
          </div>

          <motion.button
            type="button"
            onClick={() => void run(signInWithGoogle)}
            disabled={busy}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.993 }}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-sm font-medium transition"
            style={{ border: "1px solid var(--border-md)", background: "var(--bg-subtle)", color: "var(--fg)" }}
          >
            Continue with Google
          </motion.button>
        </div>

        <DemoAccounts
          onSelect={(demoEmail, demoPassword) => {
            setEmail(demoEmail);
            setPassword(demoPassword);
            setFeedback(null);
          }}
        />

        <AnimatePresence mode="wait">
          {feedback && (
            <motion.p
              key={feedback.text}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              role={feedback.tone === "error" ? "alert" : "status"}
              className="rounded-2xl px-4 py-3 text-sm"
              style={
                feedback.tone === "error"
                  ? { border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171" }
                  : { border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }
              }
            >
              {feedback.text}
            </motion.p>
          )}
        </AnimatePresence>
      </form>
    </motion.div>
  );
}
