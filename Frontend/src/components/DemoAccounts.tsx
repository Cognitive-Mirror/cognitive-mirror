"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, KeyRound } from "lucide-react";
import { getDemoAccounts } from "@/services/auth";
import type { RoleId } from "@/hooks/useRole";

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
