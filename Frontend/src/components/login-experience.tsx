"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  Crown,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
  Waypoints,
} from "lucide-react";
import roleConfig from "@/data/roles.json";
import { getDemoAccounts, mockAuthenticate, type RoleId } from "@/services/auth";

type FormState = {
  email: string;
  password: string;
  rememberMe: boolean;
};

type RoleCard = {
  id: RoleId;
  name: string;
  description: string;
  redirect: string;
};

const roles = roleConfig.roles as RoleCard[];
const demoAccounts = getDemoAccounts();
const roleIcons = {
  admin: Crown,
  manager: ShieldCheck,
  learner: Waypoints,
} as const;
const roleTones = {
  admin: "from-[#C9A25E]/22 to-[#A2772B]/10",
  manager: "from-[#8B6FCF]/18 to-[#6A58A7]/10",
  learner: "from-white/10 to-white/5",
} as const;

export function LoginExperience() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>("learner");
  const [isDemoOpen, setIsDemoOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formState, setFormState] = useState<FormState>({
    email: "",
    password: "",
    rememberMe: true,
  });

  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0];

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
          ? `Welcome back. We recognized the ${result.resolvedRole.name} demo account.`
          : `You are entering through the ${result.resolvedRole.name} path. A real backend can take over here later.`,
      );

      router.push(result.redirect);
    });
  };

  const handleDemoSelect = (account: {
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
    setFeedback(`Filled the ${account.roleId} demo account for you.`);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#09090B] px-4 py-10 text-[#FAFAFA] sm:px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(126,105,171,0.22),transparent_34%),radial-gradient(circle_at_bottom,rgba(201,162,94,0.10),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_18%)]" />
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [-14, 14, -14], x: [-4, 8, -4], rotate: [-4, 3, -4] }
          }
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-[12%] top-[12%] h-48 w-48 rounded-full border border-white/10 bg-white/6 blur-3xl"
        />
        <motion.div
          animate={
            shouldReduceMotion
              ? undefined
              : { y: [10, -12, 10], x: [0, -10, 0], rotate: [4, -3, 4] }
          }
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-[10%] right-[10%] h-72 w-72 rounded-full bg-[#7E69AB]/18 blur-3xl"
        />
        <motion.div
          animate={shouldReduceMotion ? undefined : { scale: [1, 1.05, 1], opacity: [0.38, 0.54, 0.38] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute inset-x-[18%] top-[15%] h-px bg-gradient-to-r from-transparent via-[#C9A25E]/40 to-transparent"
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 18, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-[760px] overflow-hidden rounded-[36px] border border-white/10 bg-white/8 p-5 shadow-[0_30px_120px_rgba(0,0,0,0.52)] backdrop-blur-3xl sm:p-7"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E8D3A8]/65 to-transparent" />
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02)_28%,transparent_60%)]" />

        <div className="relative rounded-[30px] border border-white/8 bg-[#0E0E12]/88 p-6 sm:p-8">
          <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-[11px] uppercase tracking-[0.26em] text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 text-[#E8D3A8]" />
                Human-centered access
              </div>
              <div className="space-y-3">
                <p className="text-sm font-semibold uppercase tracking-[0.30em] text-zinc-500">
                  Cognitive Mirror
                </p>
                <h1 className="text-4xl font-semibold tracking-[-0.06em] text-zinc-50 sm:text-5xl">
                  Welcome Back
                </h1>
                <p className="max-w-xl text-sm leading-7 text-zinc-400 sm:text-base">
                  Sign in to continue your capability journey. Thoughtful systems,
                  real people, and meaningful growth still belong together.
                </p>
              </div>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-white/6 px-4 py-4 text-left shadow-[0_12px_40px_rgba(0,0,0,0.28)] sm:min-w-[188px]">
              <p className="text-[11px] uppercase tracking-[0.26em] text-zinc-500">
                Selected Role
              </p>
              <p className="mt-2 text-lg font-medium text-zinc-100">
                {selectedRole.name}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                {selectedRole.description}
              </p>
            </div>
          </div>

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="grid gap-4">
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
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/4 pl-11 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-[#8B6FCF] focus:bg-white/7 focus:ring-2 focus:ring-[#8B6FCF]/20"
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
                    className="h-14 w-full rounded-2xl border border-white/10 bg-white/4 pl-11 pr-4 text-sm text-zinc-50 outline-none transition placeholder:text-zinc-500 focus:border-[#8B6FCF] focus:bg-white/7 focus:ring-2 focus:ring-[#8B6FCF]/20"
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
                  className="h-4 w-4 rounded border-white/15 bg-black/20 text-[#8B6FCF] focus:ring-[#8B6FCF]/30"
                />
                Remember Me
              </label>
              <button
                type="button"
                className="text-left text-zinc-300 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
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
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#9B7AE3_0%,#765DB6_55%,#5F4B92_100%)] px-5 text-sm font-semibold text-white shadow-[0_24px_60px_rgba(126,105,171,0.36)] transition disabled:cursor-not-allowed disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BDA2FF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
              >
                {isPending ? "Opening your workspace..." : "Login"}
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
                className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-sm font-medium text-zinc-100 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
              >
                Continue with Google
              </motion.button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-100">Choose a role</p>
                <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
                  <Users className="h-3.5 w-3.5" />
                  Local experience only
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {roles.map((role) => {
                  const Icon = roleIcons[role.id];
                  const isSelected = role.id === selectedRoleId;

                  return (
                    <motion.button
                      key={role.id}
                      type="button"
                      whileHover={{ y: -3 }}
                      whileTap={{ scale: 0.988 }}
                      onClick={() => setSelectedRoleId(role.id)}
                      aria-pressed={isSelected}
                      className={`rounded-[24px] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12] ${
                        isSelected
                          ? "border-[#B497FF]/55 bg-white/9 shadow-[0_20px_60px_rgba(126,105,171,0.22)]"
                          : "border-white/8 bg-white/4 hover:bg-white/7"
                      }`}
                    >
                      <div
                        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br ${roleTones[role.id]}`}
                      >
                        <Icon className="h-5 w-5 text-zinc-100" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-100">{role.name}</p>
                      <p className="mt-2 text-xs leading-5 text-zinc-400">
                        {role.description}
                      </p>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[24px] border border-white/8 bg-white/4">
              <button
                type="button"
                onClick={() => setIsDemoOpen((current) => !current)}
                aria-expanded={isDemoOpen}
                className="flex w-full items-center justify-between px-4 py-4 text-left transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                    <KeyRound className="h-4 w-4 text-[#E8D3A8]" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-zinc-100">
                      Demo Accounts
                    </span>
                    <span className="block text-xs text-zinc-500">
                      One click fills the form so you can explore quickly
                    </span>
                  </span>
                </span>
                <ChevronDown
                  className={`h-4 w-4 text-zinc-400 transition-transform ${
                    isDemoOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isDemoOpen ? (
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
                          onClick={() => handleDemoSelect(account)}
                          className="w-full rounded-2xl border border-white/8 bg-black/15 px-4 py-3 text-left transition hover:border-[#B497FF]/35 hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
                        >
                          <div className="flex items-start justify-between gap-4">
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

            <AnimatePresence mode="wait">
              {feedback ? (
                <motion.p
                  key={feedback}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="rounded-2xl border border-[#C9A25E]/18 bg-[#C9A25E]/10 px-4 py-3 text-sm text-[#F3E1BB]"
                  aria-live="polite"
                >
                  {feedback}
                </motion.p>
              ) : null}
            </AnimatePresence>

            <div className="flex flex-col gap-2 border-t border-white/8 pt-2 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
              <p>Need a hand?</p>
              <button
                type="button"
                className="text-left text-zinc-300 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6FCF] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E0E12]"
              >
                Contact Administrator
              </button>
            </div>
          </form>
        </div>
      </motion.section>
    </main>
  );
}
