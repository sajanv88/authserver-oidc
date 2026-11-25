"use server";

import { db } from "@repo/db";
import { refresh } from "next/cache";
import * as v from "valibot";
import { CAPTCHA_MESSAGE } from "@/shared/auth/auth-errors";
import { callAuth } from "@/shared/auth/server-endpoint";
import { type AuthSession, requireAdmin } from "@/shared/auth/session";
import { env } from "@/shared/config/env";
import { sendEmailInBackground } from "@/shared/email";
import { formPassesTurnstile } from "@/shared/security/turnstile-form";
import { type AuthFlow, traceFlow } from "@/shared/telemetry/trace-flow";
import { parseForm } from "@/shared/validation/field-errors";
import { text } from "@/shared/validation/form-data";
import { USERS_PATH, userPath } from "../paths";
import { ADMIN_PROBLEMS } from "../problems";
import {
  ChangeRoleSchema,
  DeleteUserSchema,
  DisableUserSchema,
  RequireTwoFactorSchema,
  UserIdSchema,
} from "../schemas/users";
import {
  type AdminDeps,
  changeRole,
  deleteUser,
  disableUser,
  enableUser,
  requireTwoFactor,
  resetUserTwoFactor,
  signOutUser,
} from "../server/manage";
import type { AdminResult, DeleteUserState, DisableUserState } from "../types";

// The Users screens' actions. Each one: the admin session (Next has already checked the
// request's Origin), valibot, then a function in server/manage.ts, which finds the account
// again and calls Better Auth's admin endpoint, which checks the admin role again. They're
// public POST endpoints like any server action.

function depsFor(session: AuthSession): AdminDeps {
  return {
    call: callAuth,
    db,
    actor: { userId: session.user.id },
    sendEmail: sendEmailInBackground,
    env: env(),
  };
}

/** The admin session, coming back to the user's page (or the list, for a bad id). */
function adminFor(userId: unknown): Promise<AuthSession> {
  const parsed = v.safeParse(UserIdSchema, userId);
  return requireAdmin(parsed.success ? userPath(parsed.output) : USERS_PATH);
}

/** A buttons-only action: the user's id (bound in the page), and what it does. */
async function act<Input>(
  flow: AuthFlow,
  userId: unknown,
  schema: v.GenericSchema<unknown, Input>,
  input: unknown,
  run: (deps: AdminDeps, input: Input) => Promise<AdminResult>,
): Promise<AdminResult> {
  const session = await adminFor(userId);
  const parsed = v.safeParse(schema, input);
  if (!parsed.success) return { ok: false, problem: "not-found" };
  const result = await traceFlow(flow, () => run(depsFor(session), parsed.output), {
    "admin.target.user_id": String(userId),
  });
  refresh();
  return result;
}

export async function enableUserAction(userId: unknown): Promise<AdminResult> {
  return act("admin.user.enable", userId, UserIdSchema, userId, enableUser);
}

export async function signOutUserAction(userId: unknown): Promise<AdminResult> {
  return act("admin.user.sign_out", userId, UserIdSchema, userId, signOutUser);
}

export async function resetTwoFactorAction(userId: unknown): Promise<AdminResult> {
  return act("admin.user.two_factor.reset", userId, UserIdSchema, userId, resetUserTwoFactor);
}

export async function changeRoleAction(userId: unknown, role: unknown): Promise<AdminResult> {
  return act("admin.user.role", userId, ChangeRoleSchema, { userId, role }, changeRole);
}

export async function requireTwoFactorAction(
  userId: unknown,
  required: unknown,
): Promise<AdminResult> {
  return act(
    "admin.user.two_factor.require",
    userId,
    RequireTwoFactorSchema,
    { userId, required },
    requireTwoFactor,
  );
}

export async function disableUserAction(
  previous: DisableUserState,
  form: FormData,
): Promise<DisableUserState> {
  const userId = text(form, "userId");
  const session = await adminFor(userId);
  const values = { reason: text(form, "reason"), period: text(form, "period") };
  const attempt = previous.attempt + 1;

  const parsed = parseForm(DisableUserSchema, { userId, ...values });
  if (!parsed.ok) {
    const { userId: badId, ...errors } = parsed.errors;
    return {
      attempt,
      values,
      errors,
      ...(badId ? { formError: ADMIN_PROBLEMS["not-found"] } : {}),
    };
  }
  if (!(await formPassesTurnstile(form))) {
    return { attempt, values, formError: CAPTCHA_MESSAGE };
  }
  const result = await traceFlow(
    "admin.user.disable",
    () => disableUser(depsFor(session), parsed.value),
    { "admin.target.user_id": userId },
  );
  if (!result.ok) return { attempt, values, formError: ADMIN_PROBLEMS[result.problem] };
  refresh();
  return { attempt, values: { reason: "", period: "forever" }, done: true };
}

export async function deleteUserAction(
  previous: DeleteUserState,
  form: FormData,
): Promise<DeleteUserState> {
  const userId = text(form, "userId");
  const session = await adminFor(userId);
  const attempt = previous.attempt + 1;

  const parsed = parseForm(DeleteUserSchema, {
    userId,
    confirmation: text(form, "confirmation"),
  });
  if (!parsed.ok) {
    const { userId: badId, ...errors } = parsed.errors;
    return { attempt, errors, ...(badId ? { formError: ADMIN_PROBLEMS["not-found"] } : {}) };
  }
  if (!(await formPassesTurnstile(form))) return { attempt, formError: CAPTCHA_MESSAGE };

  const result = await traceFlow(
    "admin.user.delete",
    () => deleteUser(depsFor(session), parsed.value),
    { "admin.target.user_id": userId },
  );
  if (!result.ok) {
    return result.problem === "mismatch"
      ? { attempt, errors: { confirmation: "That isn't this account's email address." } }
      : { attempt, formError: ADMIN_PROBLEMS[result.problem] };
  }
  return { attempt, done: true };
}
