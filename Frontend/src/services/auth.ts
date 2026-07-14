import roleConfig from "@/data/roles.json";

export type RoleId = "admin" | "manager" | "learner";
export type RoleConfig = {
  id: RoleId;
  name: string;
  description: string;
  redirect: string;
};

export type LoginPayload = {
  email: string;
  password: string;
  roleId: RoleId;
  rememberMe: boolean;
};

export type DemoAccount = {
  roleId: RoleId;
  email: string;
  password: string;
  redirect: string;
};

export type LoginResult = {
  redirect: string;
  resolvedRole: RoleConfig;
  mode: "demo" | "mock";
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleId: "admin",
    email: "admin@cognitivemirror.ai",
    password: "Admin123!",
    redirect: "/admin",
  },
  {
    roleId: "manager",
    email: "manager@cognitivemirror.ai",
    password: "Manager123!",
    redirect: "/manager",
  },
  {
    roleId: "learner",
    email: "learner@cognitivemirror.ai",
    password: "Learner123!",
    redirect: "/learner",
  },
];

function findRole(roleId: RoleId) {
  const roles = roleConfig.roles as RoleConfig[];
  return roles.find((role) => role.id === roleId) ?? roles[0];
}

export function getDemoAccounts(): DemoAccount[] {
  return DEMO_ACCOUNTS;
}

export async function mockAuthenticate(
  payload: LoginPayload,
): Promise<LoginResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));

  const matchedAccount = DEMO_ACCOUNTS.find(
    (account) =>
      account.email.toLowerCase() === payload.email.toLowerCase().trim() &&
      account.password === payload.password,
  );

  if (matchedAccount) {
    return {
      redirect: matchedAccount.redirect,
      resolvedRole: findRole(matchedAccount.roleId),
      mode: "demo",
    };
  }

  const selectedRole = findRole(payload.roleId);

  return {
    redirect: selectedRole.redirect,
    resolvedRole: selectedRole,
    mode: "mock",
  };
}
