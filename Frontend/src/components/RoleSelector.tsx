"use client";

import { motion } from "framer-motion";
import { BriefcaseBusiness, ShieldCheck, UserRound } from "lucide-react";
import type { RoleConfig, RoleId } from "@/hooks/useRole";

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
