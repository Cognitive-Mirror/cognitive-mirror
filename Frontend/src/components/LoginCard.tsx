"use client";

import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { DemoAccounts } from "@/components/DemoAccounts";
import { RoleSelector } from "@/components/RoleSelector";
import { useRole, type RoleId } from "@/hooks/useRole";
import { mockAuthenticate } from "@/services/auth";

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
