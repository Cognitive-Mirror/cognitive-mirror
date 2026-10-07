/**
 * Roles and where each one lands after sign-in.
 *
 * The role itself is never chosen on the client: it comes from the backend's
 * `users` table via GET /auth/me. This file only maps it to routes.
 */

export type RoleId = "learner" | "manager" | "admin";

export const ROLE_HOME: Record<RoleId, string> = {
  learner: "/learner",
  manager: "/manager",
  admin: "/admin",
};

export const ROLE_LABEL: Record<RoleId, string> = {
  learner: "Learner",
  manager: "Manager",
  admin: "Admin",
};

type DemoAccount = { email: string; password: string; role: RoleId };

/**
 * Demo tenant accounts, offered as autofill on the sign-in screen. They must
 * exist in Firebase Auth; their role comes from the seeded `users` rows.
 */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { email: "learner@cognitivemirror.ai", password: "Learner123!", role: "learner" },
  { email: "manager@cognitivemirror.ai", password: "Manager123!", role: "manager" },
  { email: "admin@cognitivemirror.ai", password: "Admin123!", role: "admin" },
];
