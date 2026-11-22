"use server";

import { captchaToken, withCaptcha } from "@/shared/auth/captcha";
import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth } from "@/shared/auth/server-endpoint";
import { parseForm } from "@/shared/validation/field-errors";
import { text } from "@/shared/validation/form-data";
import {
  ForgotPasswordSchema,
  mismatchErrors,
  ResetPasswordSchema,
} from "../schemas/password-reset";
import { requestReset, resetPassword } from "../server/password-reset";
import type { ForgotPasswordState, ResetPasswordState } from "../types";

// Public by nature: Next has checked the Origin, valibot the fields; Better Auth rate-limits by
// client IP, and the reset token is single use.

export async function requestResetAction(
  previous: ForgotPasswordState,
  form: FormData,
): Promise<ForgotPasswordState> {
  const attempt = previous.attempt + 1;
  const email = text(form, "email");
  const parsed = parseForm(ForgotPasswordSchema, { email });
  if (!parsed.ok) return { status: "editing", attempt, email, error: parsed.errors.email };
  const outcome = await requestReset(
    withCaptcha(callAuth, captchaToken(form)),
    parsed.value.email,
    safeReturnPath(text(form, "next")),
  );
  return outcome.kind === "sent"
    ? { status: "sent", attempt, email: parsed.value.email }
    : { status: "editing", attempt, email, formError: outcome.message };
}

export async function resetPasswordAction(
  previous: ResetPasswordState,
  form: FormData,
): Promise<ResetPasswordState> {
  const attempt = previous.attempt + 1;
  const parsed = parseForm(ResetPasswordSchema, {
    password: text(form, "password"),
    confirmPassword: text(form, "confirmPassword"),
  });
  const errors = parsed.ok ? mismatchErrors(parsed.value) : parsed.errors;
  if (!parsed.ok || Object.keys(errors).length > 0) return { status: "editing", attempt, errors };

  const outcome = await resetPassword(
    withCaptcha(callAuth, captchaToken(form)),
    text(form, "token"),
    parsed.value.password,
  );
  switch (outcome.kind) {
    case "done":
      return { status: "done", attempt };
    case "expired":
      return { status: "expired", attempt };
    case "password":
      return { status: "editing", attempt, errors: { password: outcome.message } };
    case "failed":
      return { status: "editing", attempt, errors: {}, formError: outcome.message };
  }
}
