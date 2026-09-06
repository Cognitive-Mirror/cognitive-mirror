/**
 * Role definitions and demo credentials for the sign-in screen.
 *
 * Authentication itself runs through Firebase (see services/authService.ts).
 * The previous `mockAuthenticate` helper and the FastAPI `/login` endpoint it
 * called were removed: they compared plaintext passwords server-side and were
 * no longer reachable from the UI.
 */

export type RoleId = "admin" | "manager" | "learner";

export type RoleConfig = {
  id: RoleId;
  name: string;
  description: string;
  redirect: `/${RoleId}`;
};

type DemoAccount = {
  email: string;
  password: string;
  roleId: RoleId;
  redirect: `/${RoleId}`;
};

export const ROLES: RoleConfig[] = [
  {
    id: "learner",
    name: "Learner",
    description: "Track growth, submit evidence, and follow capability pathways.",
    redirect: "/learner",
  },
  {
    id: "manager",
    name: "Manager",
    description: "Review team progress, validate evidence, and guide development.",
    redirect: "/manager",
  },
  {
    id: "admin",
    name: "Admin",
    description: "Configure roles, manage access, and monitor platform readiness.",
    redirect: "/admin",
  },
];

/**
 * Convenience credentials for the demo tenant. These prefill the sign-in form;
 * the accounts must exist in Firebase Auth for sign-in to succeed.
 */
const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: "learner@cognitivemirror.ai",
    password: "Learner123!",
    roleId: "learner",
    redirect: "/learner",
  },
  {
    email: "manager@cognitivemirror.ai",
    password: "Manager123!",
    roleId: "manager",
    redirect: "/manager",
  },
  {
    email: "admin@cognitivemirror.ai",
    password: "Admin123!",
    roleId: "admin",
    redirect: "/admin",
  },
];

export function getDemoAccounts() {
  return DEMO_ACCOUNTS;
}
