"use client";

import { useMemo, useState } from "react";
import roleConfig from "@/data/roles.json";

export type RoleId = "admin" | "manager" | "learner";
export type RoleConfig = {
  id: RoleId;
  name: string;
  description: string;
  redirect: string;
};

const DEFAULT_ROLE_ID: RoleId = "learner";

export function useRole(initialRoleId: RoleId = DEFAULT_ROLE_ID) {
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>(initialRoleId);
  const roles = roleConfig.roles as RoleConfig[];

  const selectedRole = useMemo(() => {
    return (
      roles.find((role) => role.id === selectedRoleId) ??
      roles[0]
    );
  }, [roles, selectedRoleId]);

  return {
    roles,
    selectedRole,
    selectedRoleId,
    setSelectedRoleId,
  };
}
