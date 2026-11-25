import "server-only";
import {
  type AdminActor,
  type Executor,
  getUserDetail,
  recordAdminAction,
  resetTwoFactor,
  setTwoFactorRequired,
  type UserDetail,
  userStatus,
} from "@repo/db";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import type { AuthCaller, EndpointError } from "@/shared/auth/endpoint";
import { twoFactorRequired } from "@/shared/auth/two-factor-policy";
import type { ServerEnv } from "@/shared/config/env";
import {
  accountDeletedTemplate,
  accountDisabledTemplate,
  accountEnabledTemplate,
  type EmailContent,
  twoFactorResetTemplate,
} from "@/shared/email";
import {
  type ChangeRoleInput,
  type DeleteUserInput,
  DISABLE_PERIODS,
  type DisableUserInput,
  type RequireTwoFactorInput,
} from "../schemas/users";
import type { AdminProblem, AdminResult } from "../types";

// What an admin does to someone's account. Each function finds the account again, refuses the
// admin's own, runs Better Auth's admin endpoint where there is one (it checks the admin role
// again), records the action, and emails the person where they should hear of it. They take
// what they need as arguments, so the server actions and the tests pass the same things.

export type AdminDeps = {
  /** Better Auth's endpoints, with the admin's own session (callAuth, or a test browser's). */
  call: AuthCaller;
  db: Executor;
  /** The admin acting, as the audit log records them. */
  actor: { userId: string };
  sendEmail: (to: string, email: Promise<EmailContent>) => void;
  env: Pick<ServerEnv, "appName" | "logoUrl" | "betterAuthUrl" | "twoFactorRequiredForAdmins">;
};

const NOT_FOUND = { ok: false, problem: "not-found" } as const;
const SELF = { ok: false, problem: "self" } as const;
const OK = { ok: true } as const;

/** When a disabled account opens again, as the email writes it. */
const untilFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

function brand(env: AdminDeps["env"]) {
  return { appName: env.appName, logoUrl: env.logoUrl };
}

/** The account, unless it's gone or it's the admin's own. */
async function target(
  deps: AdminDeps,
  userId: string,
): Promise<{ ok: true; user: UserDetail } | { ok: false; problem: AdminProblem }> {
  if (userId === deps.actor.userId) return SELF;
  const user = await getUserDetail(deps.db, userId);
  return user ? { ok: true, user } : NOT_FOUND;
}

/** Better Auth's refusal, as something the screen can say. */
function problemFrom(error: EndpointError): AdminProblem {
  if (error.status === 404) return "not-found";
  if (error.status === 401 || error.status === 403) return "not-allowed";
  if (error.code?.startsWith("YOU_CANNOT_")) return "self";
  return "failed";
}

/** Runs an admin endpoint; a refusal is logged with its status and code only. */
async function run(
  deps: AdminDeps,
  path: `/${string}`,
  body: Record<string, unknown>,
): Promise<AdminResult> {
  const result = await deps.call({ path, body });
  if (result.ok) return OK;
  const problem = problemFrom(result.error);
  const line = `user-admin: ${path} refused as ${problem} (status ${result.error.status}, ${String(result.error.code ?? result.error.error)})`;
  if (problem === "failed") console.error(line);
  else console.warn(line);
  return { ok: false, problem };
}

function record(deps: AdminDeps, entry: Omit<Parameters<typeof recordAdminAction>[1], "actor">) {
  const actor: AdminActor = { userId: deps.actor.userId };
  return recordAdminAction(deps.db, { ...entry, actor });
}

/**
 * Disables an account, for a while or until an admin enables it: it can't sign in by any
 * method, its sessions end, and its apps' tokens are revoked (account-policy.ts).
 */
export async function disableUser(deps: AdminDeps, input: DisableUserInput): Promise<AdminResult> {
  const found = await target(deps, input.userId);
  if (!found.ok) return found;
  const seconds = DISABLE_PERIODS[input.period];
  const result = await run(deps, "/admin/ban-user", {
    userId: input.userId,
    ...(input.reason ? { banReason: input.reason } : {}),
    ...(seconds ? { banExpiresIn: seconds } : {}),
  });
  if (!result.ok) return result;

  const until = seconds ? new Date(Date.now() + seconds * 1000) : undefined;
  await record(deps, {
    action: "user.disable",
    targetUserId: input.userId,
    detail: until?.toISOString(),
  });
  deps.sendEmail(
    found.user.email,
    accountDisabledTemplate({
      ...brand(deps.env),
      until: until ? `${untilFormat.format(until)} UTC` : undefined,
    }),
  );
  return OK;
}

/** Enables a disabled account. It's told only if it was disabled. */
export async function enableUser(deps: AdminDeps, userId: string): Promise<AdminResult> {
  const found = await target(deps, userId);
  if (!found.ok) return found;
  const wasDisabled = userStatus(found.user) === "disabled";
  const result = await run(deps, "/admin/unban-user", { userId });
  if (!result.ok) return result;
  await record(deps, { action: "user.enable", targetUserId: userId });
  if (wasDisabled) {
    deps.sendEmail(
      found.user.email,
      accountEnabledTemplate({
        ...brand(deps.env),
        loginUrl: `${deps.env.betterAuthUrl}${AUTH_PAGES.login}`,
      }),
    );
  }
  return OK;
}

/** Ends every session of the account, and revokes its apps' tokens (account-policy.ts). */
export async function signOutUser(deps: AdminDeps, userId: string): Promise<AdminResult> {
  const found = await target(deps, userId);
  if (!found.ok) return found;
  const result = await run(deps, "/admin/revoke-user-sessions", { userId });
  if (!result.ok) return result;
  await record(deps, { action: "user.sign_out", targetUserId: userId });
  return OK;
}

/** Makes someone an admin, or a user again. */
export async function changeRole(deps: AdminDeps, input: ChangeRoleInput): Promise<AdminResult> {
  const found = await target(deps, input.userId);
  if (!found.ok) return found;
  if (found.user.role === input.role) return OK;
  const result = await run(deps, "/admin/set-role", { userId: input.userId, role: input.role });
  if (!result.ok) return result;
  await record(deps, { action: "user.role", targetUserId: input.userId, detail: input.role });
  return OK;
}

/**
 * Requires two-factor of someone, or stops requiring it. From their next request they're sent
 * to set it up, and no app signs them in until they have (two-factor-policy.ts).
 */
export async function requireTwoFactor(
  deps: AdminDeps,
  input: RequireTwoFactorInput,
): Promise<AdminResult> {
  const found = await target(deps, input.userId);
  if (!found.ok) return found;
  if (found.user.twoFactorRequired === input.required) return OK;
  if (!(await setTwoFactorRequired(deps.db, input.userId, input.required))) return NOT_FOUND;
  await record(deps, {
    action: input.required ? "user.two_factor.require" : "user.two_factor.unrequire",
    targetUserId: input.userId,
  });
  return OK;
}

/**
 * Turns two-factor off for someone who lost their authenticator, and tells them: if they
 * didn't ask, it's how they find out. If it's required of them, they set it up again at their
 * next sign-in.
 */
export async function resetUserTwoFactor(deps: AdminDeps, userId: string): Promise<AdminResult> {
  const found = await target(deps, userId);
  if (!found.ok) return found;
  if (!found.user.twoFactorEnabled) return OK;
  if (!(await resetTwoFactor(deps.db, userId))) return NOT_FOUND;
  await record(deps, { action: "user.two_factor.reset", targetUserId: userId });
  deps.sendEmail(
    found.user.email,
    twoFactorResetTemplate({
      ...brand(deps.env),
      settingsUrl: `${deps.env.betterAuthUrl}${SECURITY_PAGES.twoFactor}`,
      required: twoFactorRequired(found.user, {
        requiredForAdmins: deps.env.twoFactorRequiredForAdmins,
      }),
    }),
  );
  return OK;
}

export type DeleteResult = AdminResult | { ok: false; problem: "mismatch" };

/**
 * Deletes an account for good, once the admin has typed its email address. Its sessions,
 * sign-in methods, two-factor, consents and apps' tokens go with it (the tables cascade); the
 * audit log keeps the bare id.
 */
export async function deleteUser(deps: AdminDeps, input: DeleteUserInput): Promise<DeleteResult> {
  const found = await target(deps, input.userId);
  if (!found.ok) return found;
  if (input.confirmation !== found.user.email.toLowerCase()) {
    return { ok: false, problem: "mismatch" };
  }
  const result = await run(deps, "/admin/remove-user", { userId: input.userId });
  if (!result.ok) return result;
  await record(deps, { action: "user.delete", targetUserId: input.userId });
  deps.sendEmail(found.user.email, accountDeletedTemplate(brand(deps.env)));
  return OK;
}
