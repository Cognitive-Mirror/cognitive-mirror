"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BriefcaseBusiness,
  ChevronDown,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import {
  getDemoAccounts,
  ROLES,
  type RoleConfig,
  type RoleId,
} from "@/lib/auth";

import {
  login,
  loginWithGoogle,
  getUserRole,
} from "@/services/authService";

export function useRole(initialRoleId: RoleId = "learner") {
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>(initialRoleId);
  const selectedRole = useMemo(
    () => ROLES.find((r) => r.id === selectedRoleId) ?? ROLES[0],
    [selectedRoleId]
  );
  return { roles: ROLES, selectedRole, selectedRoleId, setSelectedRoleId };
}

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
  { label: "Capability",  top: "8%",  left: "10%" },
  { label: "AI Review",   top: "16%", left: "55%" },
  { label: "Evidence",    top: "72%", left: "8%"  },
  { label: "Validation",  top: "80%", left: "58%" },
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

/* ── 3. DemoAccounts ── */
const demoAccounts = getDemoAccounts();

type DemoAccountsProps = {
  onSelectAccount: (a: { email: string; password: string; roleId: RoleId }) => void;
};

export function DemoAccounts({ onSelectAccount }: DemoAccountsProps) {
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
            <span className="block text-sm font-medium" style={{ color: "var(--fg)" }}>Demo Accounts</span>
            <span className="block text-xs" style={{ color: "var(--fg-muted)" }}>One click fills the login form</span>
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
              {demoAccounts.map((account) => (
                <button
                  key={account.roleId}
                  type="button"
                  onClick={() => onSelectAccount(account)}
                  className="demo-panel-row"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                        {account.roleId.charAt(0).toUpperCase() + account.roleId.slice(1)}
                      </p>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--fg-muted)" }}>{account.email}</p>
                    </div>
                    <div className="text-right text-xs" style={{ color: "var(--fg-subtle)" }}>
                      <p>{account.password}</p>
                      <p>{account.redirect}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── 4. RoleSelector ── */
const ROLE_ICONS = { admin: ShieldCheck, manager: BriefcaseBusiness, learner: UserRound } as const;

type RoleSelectorProps = {
  roles: RoleConfig[];
  selectedRoleId: RoleId;
  onSelect: (id: RoleId) => void;
};

export function RoleSelector({ roles, selectedRoleId, onSelect }: RoleSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>Choose a role</p>
        <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>Mock state only</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {roles.map((role) => {
          const Icon = ROLE_ICONS[role.id as RoleId];
          const selected = role.id === selectedRoleId;
          return (
            <motion.button
              key={role.id}
              type="button"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onSelect(role.id)}
              aria-pressed={selected}
              className={`role-card${selected ? " selected" : ""}`}
            >
              <div
                className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ border: "1px solid var(--border)", background: "var(--bg-input)" }}
              >
                <Icon className="h-5 w-5" style={{ color: "var(--fg)" }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: "var(--fg)" }}>{role.name}</p>
              <p className="mt-1.5 text-xs leading-5" style={{ color: "var(--fg-muted)" }}>{role.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ── 5. LoginCard ── */
type FormState = { email: string; password: string; rememberMe: boolean };
const INIT: FormState = { email: "", password: "", rememberMe: true };

export function LoginCard() {
  const router = useRouter();
  const { roles, selectedRole, selectedRoleId, setSelectedRoleId } = useRole();
  const [form, setForm] = useState<FormState>(INIT);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

 const handleSubmit = async (
  e: FormEvent<HTMLFormElement>
) => {

  e.preventDefault();

  setFeedback("");

  setIsSubmitting(true);

  try {

    //-----------------------------------
    // Firebase Authentication
    //-----------------------------------

    const credential = await login(
      form.email,
      form.password
    );

    //-----------------------------------
    // Get role from Firestore
    //-----------------------------------

    const role = await getUserRole(
      credential.user.uid
    );

    //-----------------------------------
    // Redirect
    //-----------------------------------

    if (role === "admin") {

      setFeedback("Welcome Admin.");

      router.push("/admin");

    }

    else if (role === "manager") {

      setFeedback("Welcome Manager.");

      router.push("/manager");

    }

    else {

      setFeedback("Welcome Learner.");

      router.push("/learner");

    }

  }

  catch (err) {

    if (err instanceof Error)

      setFeedback(err.message);

    else

      setFeedback("Login failed.");

  }

  finally {

    setIsSubmitting(false);

  }

};

const handleGoogleLogin = async () => {

  setFeedback("");

  setIsSubmitting(true);

  try {

    const result = await loginWithGoogle();

    setFeedback("Welcome!");

    if (result.role === "admin") {

      router.push("/admin");

    } else if (result.role === "manager") {

      router.push("/manager");

    } else {

      router.push("/learner");

    }

  } catch (err) {

    if (err instanceof Error)

      setFeedback(err.message);

    else

      setFeedback("Google Sign-In failed.");

  } finally {

    setIsSubmitting(false);

  }

};

  const handleAutofill = (a: { email: string; password: string; roleId: RoleId }) => {
    setSelectedRoleId(a.roleId);
    setForm({ email: a.email, password: a.password, rememberMe: true });
    setFeedback(`Filled ${a.roleId} demo credentials.`);
  };

  return (
    <div className="w-full max-w-xl">
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="login-card relative overflow-hidden p-6 shadow-[0_32px_80px_rgba(0,0,0,0.25)] sm:p-8"
      >
        {/* top accent line */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

        {/* header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
              style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)", color: "var(--fg-muted)" }}
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: "var(--accent-fg)" }} />
              Trusted access
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em]" style={{ color: "var(--fg)" }}>
                Welcome Back
              </h2>
              <p className="mt-2 text-sm leading-6" style={{ color: "var(--fg-muted)" }}>
                Sign in to continue your capability journey.
              </p>
            </div>
          </div>
          <div
            className="hidden rounded-2xl px-4 py-3 text-right sm:block"
            style={{ border: "1px solid var(--border)", background: "var(--bg-subtle)" }}
          >
            <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: "var(--fg-subtle)" }}>Active Role</p>
            <p className="mt-1 text-sm font-medium" style={{ color: "var(--fg)" }}>{selectedRole.name}</p>
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* fields */}
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: "var(--fg)" }}>Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-muted)" }} />
                <input
                  aria-label="Email"
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="you@company.com"
                  className="login-input pl-11"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium" style={{ color: "var(--fg)" }}>Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--fg-muted)" }} />
                <input
                  aria-label="Password"
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Enter your password"
                  className="login-input pl-11"
                />
              </span>
            </label>
          </div>

          {/* remember / forgot */}
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-3" style={{ color: "var(--fg-muted)" }}>
              <input
                aria-label="Remember me"
                type="checkbox"
                checked={form.rememberMe}
                onChange={(e) => set("rememberMe", e.target.checked)}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Remember Me
            </label>
            <button
              type="button"
              className="text-left text-sm transition hover:opacity-80 sm:text-right"
              style={{ color: "var(--fg)" }}
            >
              Forgot Password
            </button>
          </div>

          {/* actions */}
          <div className="space-y-4">
            <motion.button
              type="submit"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.993 }}
              disabled={isSubmitting}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(99,102,241,0.35)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "Signing In..." : "Login"}
              <ArrowRight className="h-4 w-4" />
            </motion.button>

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 divider-line" />
              <span className="text-xs uppercase tracking-[0.28em]" style={{ color: "var(--fg-subtle)" }}>OR</span>
              <div className="h-px flex-1 divider-line" />
            </div>

            <motion.button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.993 }}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-sm font-medium transition"
              style={{
                border: "1px solid var(--border-md)",
                background: "var(--bg-subtle)",
                color: "var(--fg)",
              }}
            >
              Continue with Google
            </motion.button>
          </div>

          {/* role selector */}
          <RoleSelector roles={roles} selectedRoleId={selectedRoleId} onSelect={setSelectedRoleId} />

          {/* demo accounts */}
          <DemoAccounts onSelectAccount={handleAutofill} />

          {/* feedback */}
          <AnimatePresence mode="wait">
            {feedback && (
              <motion.p
                key={feedback}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                aria-live="polite"
                className="rounded-2xl px-4 py-3 text-sm"
                style={
                  feedback.toLowerCase().includes("invalid")
                    ? { border: "1px solid rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.08)", color: "#f87171" }
                    : { border: "1px solid rgba(34,197,94,0.2)", background: "rgba(34,197,94,0.08)", color: "#4ade80" }
                }
              >
                {feedback}
              </motion.p>
            )}
          </AnimatePresence>

          {/* footer */}
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p style={{ color: "var(--fg-subtle)" }}>Need help?</p>
            <button type="button" className="text-left transition hover:opacity-80 sm:text-right" style={{ color: "var(--fg-muted)" }}>
              Contact Administrator
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );

}

