"use client";

import { FormEvent, useState, useTransition, useMemo } from "react";
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
  mockAuthenticate,
  getDemoAccounts,
  ROLES,
  type RoleConfig,
  type RoleId,
} from "@/lib/auth";

export function useRole(initialRoleId: RoleId = "learner") {
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>(initialRoleId);

  const selectedRole = useMemo(() => {
    return ROLES.find((role) => role.id === selectedRoleId) ?? ROLES[0];
  }, [selectedRoleId]);

  return {
    roles: ROLES,
    selectedRole,
    selectedRoleId,
    setSelectedRoleId,
  };
}

/* ==========================================
   1. BackgroundAnimation Component
   ========================================== */
const NODES = [
  { label: "Capability", top: "18%", left: "12%" },
  { label: "Learning", top: "43%", left: "8%" },
  { label: "Evidence", top: "70%", left: "18%" },
  { label: "AI Review", top: "22%", left: "66%" },
  { label: "Validation", top: "52%", left: "74%" },
  { label: "Growth", top: "78%", left: "62%" },
];

const PARTICLES = [
  { top: "12%", left: "24%", delay: 0.1 },
  { top: "28%", left: "48%", delay: 0.3 },
  { top: "36%", left: "84%", delay: 0.5 },
  { top: "57%", left: "32%", delay: 0.7 },
  { top: "76%", left: "44%", delay: 0.9 },
  { top: "82%", left: "80%", delay: 1.1 },
];

export function BackgroundAnimation() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(99,102,241,0.16),transparent_38%),radial-gradient(circle_at_80%_18%,rgba(255,255,255,0.05),transparent_22%),radial-gradient(circle_at_bottom_right,rgba(99,102,241,0.18),transparent_34%)]" />

      <motion.div
        animate={
          shouldReduceMotion
            ? undefined
            : { y: [-10, 10, -10], x: [0, 8, 0], rotate: [-3, 2, -3] }
        }
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
        className="absolute left-[10%] top-[8%] h-56 w-56 rounded-full border border-white/10 bg-white/5 blur-3xl"
      />
      <motion.div
        animate={
          shouldReduceMotion ? undefined : { y: [12, -10, 12], rotate: [4, -2, 4] }
        }
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-[10%] right-[4%] h-72 w-72 rounded-full border border-white/10 bg-[#6366F1]/12 blur-3xl"
      />

      <svg
        className="absolute inset-0 h-full w-full opacity-40"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="network-stroke" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(250,250,250,0.35)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0.7)" />
          </linearGradient>
        </defs>
        <path
          d="M10,24 C22,36 30,42 42,44 S65,26 78,28 88,44 92,52"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
        <path
          d="M18,72 C26,62 32,48 44,46 S64,54 72,62 84,78 92,78"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
        <path
          d="M22,18 C30,30 40,58 52,60 S70,46 78,32"
          stroke="url(#network-stroke)"
          strokeWidth="0.32"
          fill="none"
        />
      </svg>

      {NODES.map((node, index) => (
        <motion.div
          key={node.label}
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [0, index % 2 === 0 ? -8 : 8, 0], scale: [1, 1.02, 1] }
          }
          transition={{
            duration: 7 + index,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute"
          style={{ top: node.top, left: node.left }}
        >
          <div className="rounded-full border border-white/14 bg-white/6 px-4 py-2 text-[11px] uppercase tracking-[0.28em] text-white/70 shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl">
            {node.label}
          </div>
        </motion.div>
      ))}

      {PARTICLES.map((particle) => (
        <motion.span
          key={`${particle.top}-${particle.left}`}
          animate={
            shouldReduceMotion ? undefined : { opacity: [0.25, 0.8, 0.25], scale: [1, 1.4, 1] }
          }
          transition={{
            duration: 4,
            repeat: Infinity,
            delay: particle.delay,
            ease: "easeInOut",
          }}
          className="absolute h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_16px_rgba(255,255,255,0.5)]"
          style={{ top: particle.top, left: particle.left }}
        />
      ))}
    </div>
  );
}

/* ==========================================
   2. BrandSection Component
   ========================================== */
export function BrandSection() {
  return (
    <section className="relative hidden min-h-screen overflow-hidden border-r border-white/8 lg:flex lg:w-[54%] lg:flex-col">
      <BackgroundAnimation />
      <div className="relative z-10 flex h-full flex-col justify-between px-10 py-10 xl:px-14 xl:py-12">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/6 backdrop-blur-xl">
            <Sparkles className="h-5 w-5 text-indigo-300" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-white/82 uppercase">
              Cognitive Mirror
            </p>
            <p className="text-sm text-white/48">
              Enterprise Capability Intelligence Platform
            </p>
          </div>
        </div>

        <div className="max-w-xl space-y-7">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-4 py-2 text-xs tracking-[0.28em] text-white/58 uppercase backdrop-blur-xl">
            Capability Intelligence
          </div>
          <div className="space-y-5">
            <h1 className="max-w-lg text-5xl font-semibold leading-[1.02] tracking-[-0.05em] text-white xl:text-6xl">
              Cognitive Mirror
            </h1>
            <p className="max-w-md text-xl leading-8 tracking-[-0.02em] text-zinc-300">
              Measure Capability. Validate Growth.
            </p>
            <p className="max-w-xl text-base leading-8 text-zinc-400">
              A premium operating layer for capability discovery, learning evidence,
              AI-assisted review, and manager validation across the enterprise.
            </p>
          </div>
        </div>

        <div className="grid max-w-2xl grid-cols-3 gap-4">
          {[
            "Capability pathways with clear evidence loops",
            "Structured AI review designed for human trust",
            "Validation signals for managers and leaders",
          ].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-300 backdrop-blur-xl"
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ==========================================
   3. DemoAccounts Component
   ========================================== */
type DemoAccountsProps = {
  onSelectAccount: (account: {
    email: string;
    password: string;
    roleId: RoleId;
  }) => void;
};

const demoAccounts = getDemoAccounts();

export function DemoAccounts({ onSelectAccount }: DemoAccountsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/4">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-white/4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
      >
        <span className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/20">
            <KeyRound className="h-4 w-4 text-zinc-100" />
          </span>
          <span>
            <span className="block text-sm font-medium text-zinc-100">Demo Accounts</span>
            <span className="block text-xs text-zinc-500">
              One click fills the login form
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden border-t border-white/8"
          >
            <div className="space-y-3 p-4">
              {demoAccounts.map((account) => (
                <button
                  key={account.roleId}
                  type="button"
                  onClick={() => onSelectAccount(account)}
                  className="w-full rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-left transition hover:border-indigo-400/40 hover:bg-indigo-500/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">
                        {account.roleId.charAt(0).toUpperCase() + account.roleId.slice(1)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">{account.email}</p>
                    </div>
                    <div className="text-right text-xs text-zinc-500">
                      <p>{account.password}</p>
                      <p>{account.redirect}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/* ==========================================
   4. RoleSelector Component
   ========================================== */
type RoleSelectorProps = {
  roles: RoleConfig[];
  selectedRoleId: RoleId;
  onSelect: (roleId: RoleId) => void;
};

const ROLE_ICONS = {
  admin: ShieldCheck,
  manager: BriefcaseBusiness,
  learner: UserRound,
} as const;

export function RoleSelector({
  roles,
  selectedRoleId,
  onSelect,
}: RoleSelectorProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-100">Choose a role</p>
        <p className="text-xs text-zinc-500">Mock state only</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {roles.map((role) => {
          const Icon = ROLE_ICONS[role.id as RoleId];
          const isSelected = role.id === selectedRoleId;

          return (
            <motion.button
              key={role.id}
              type="button"
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.985 }}
              onClick={() => onSelect(role.id)}
              aria-pressed={isSelected}
              className={`group rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] ${
                isSelected
                  ? "border-indigo-400/80 bg-indigo-500/12 shadow-[0_18px_40px_rgba(99,102,241,0.16)]"
                  : "border-white/8 bg-white/4 hover:border-white/14 hover:bg-white/7"
              }`}
            >
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-white/8 bg-black/20 text-zinc-100">
                <Icon className="h-5 w-5" />
              </div>
              <p className="text-sm font-semibold text-zinc-100">{role.name}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">{role.description}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

/* ==========================================
   5. LoginCard Component
   ========================================== */
type FormState = {
  email: string;
  password: string;
  rememberMe: boolean;
};

const INITIAL_FORM_STATE: FormState = {
  email: "",
  password: "",
  rememberMe: true,
};

export function LoginCard() {
  const router = useRouter();
  const { roles, selectedRole, selectedRoleId, setSelectedRoleId } = useRole();
  const [formState, setFormState] = useState<FormState>(INITIAL_FORM_STATE);
  const [feedback, setFeedback] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback("");

    startTransition(async () => {
      const result = await mockAuthenticate({
        email: formState.email,
        password: formState.password,
        roleId: selectedRoleId,
        rememberMe: formState.rememberMe,
      });

      setFeedback(
        result.mode === "demo"
          ? `Demo account recognized. Redirecting to ${result.resolvedRole.name}.`
          : `Mock sign-in successful. Routing by the selected ${result.resolvedRole.name} role.`,
      );

      router.push(result.redirect);
    });
  };

  const handleAutofill = (account: {
    email: string;
    password: string;
    roleId: RoleId;
  }) => {
    setSelectedRoleId(account.roleId);
    setFormState({
      email: account.email,
      password: account.password,
      rememberMe: true,
    });
    setFeedback(`Filled ${account.roleId} demo credentials.`);
  };

  return (
    <div className="w-full max-w-xl">
      <motion.div
        initial={{ opacity: 0, x: 22 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.55, ease: "easeOut" }}
        className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[#111113]/92 p-6 shadow-[0_32px_120px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />

        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 text-indigo-300" />
              Trusted access
            </div>
            <div>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-zinc-50">
                Welcome Back
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Sign in to continue your capability journey.
              </p>
            </div>
          </div>
          <div className="hidden rounded-2xl border border-white/8 bg-white/5 px-4 py-3 text-right sm:block">
            <p className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Active Role</p>
            <p className="mt-1 text-sm font-medium text-zinc-100">{selectedRole.name}</p>
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">Email</span>
              <span className="relative block">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  aria-label="Email"
                  type="email"
                  required
                  value={formState.email}
                  onChange={(event) => updateField("email", event.target.value)}
                  placeholder="you@company.com"
                  className="h-14 w-full rounded-2xl border border-white/8 bg-black/20 pl-11 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-indigo-400/70 focus:bg-black/30 focus:ring-2 focus:ring-indigo-400/20"
                />
              </span>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-200">Password</span>
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  aria-label="Password"
                  type="password"
                  required
                  value={formState.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  placeholder="Enter your password"
                  className="h-14 w-full rounded-2xl border border-white/8 bg-black/20 pl-11 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-indigo-400/70 focus:bg-black/30 focus:ring-2 focus:ring-indigo-400/20"
                />
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 text-sm text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex items-center gap-3">
              <input
                aria-label="Remember me"
                type="checkbox"
                checked={formState.rememberMe}
                onChange={(event) => updateField("rememberMe", event.target.checked)}
                className="h-4 w-4 rounded border-white/15 bg-black/20 text-indigo-400 focus:ring-indigo-400/30"
              />
              Remember Me
            </label>
            <button
              type="button"
              className="text-left text-zinc-300 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] sm:text-right"
            >
              Forgot Password
            </button>
          </div>

          <div className="space-y-4">
            <motion.button
              type="submit"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.992 }}
              disabled={isPending}
              className="flex h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-indigo-500 px-5 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(99,102,241,0.35)] transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
            >
              <span className="relative">
                {isPending ? "Signing In..." : "Login"}
              </span>
              <ArrowRight className="h-4 w-4" />
            </motion.button>

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-white/8" />
              <span className="text-xs uppercase tracking-[0.28em] text-zinc-500">OR</span>
              <div className="h-px flex-1 bg-white/8" />
            </div>

            <motion.button
              type="button"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.992 }}
              className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-zinc-100 transition hover:border-white/16 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113]"
            >
              Continue with Google
            </motion.button>
          </div>

          <RoleSelector
            roles={roles}
            selectedRoleId={selectedRoleId}
            onSelect={setSelectedRoleId}
          />

          <DemoAccounts onSelectAccount={handleAutofill} />

          <AnimatePresence mode="wait">
            {feedback ? (
              <motion.p
                key={feedback}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-emerald-500/16 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
                aria-live="polite"
              >
                {feedback}
              </motion.p>
            ) : null}
          </AnimatePresence>

          <div className="flex flex-col gap-2 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Need help?</p>
            <button
              type="button"
              className="text-left text-zinc-300 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111113] sm:text-right"
            >
              Contact Administrator
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
