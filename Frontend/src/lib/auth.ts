export type RoleId = "admin" | "manager" | "learner";

export type RoleConfig = {
  id: RoleId;
  name: string;
  description: string;
  redirect: `/${RoleId}`;
};

type LoginRequest = {
  email: string;
  password: string;
  roleId: RoleId;
  rememberMe: boolean;
};

type DemoAccount = {
  email: string;
  password: string;
  roleId: RoleId;
  redirect: `/${RoleId}`;
};

type AuthResult =
  | {
      success: true;
      message: string;
      resolvedRole: RoleConfig;
      redirect: `/${RoleId}`;
    }
  | {
      success: false;
      message: string;
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

export async function mockAuthenticate({
  email,
  password,
}: LoginRequest): Promise<AuthResult> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${apiUrl}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => null);

      return {
        success: false,
        message: error?.detail ?? "Invalid username or password.",
      };
    }

    const result: {
      success: boolean;
      message: string;
      redirect: `/${RoleId}`;
    } = await response.json();

    const resolvedRole =
      ROLES.find((role) => role.redirect === result.redirect) ?? ROLES[0];

    return {
      success: true,
      message: result.message,
      resolvedRole,
      redirect: result.redirect,
    };
  } catch {
    return {
      success: false,
      message: "Could not reach FastAPI. Make sure the backend is running on port 8000.",
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}
