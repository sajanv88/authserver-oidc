"use server";

import { captchaToken, withCaptcha } from "@/shared/auth/captcha";
import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth } from "@/shared/auth/server-endpoint";
import { parseForm } from "@/shared/validation/field-errors";
import { text, texts } from "@/shared/validation/form-data";
import { ResendVerificationSchema, SignUpSchema } from "../schemas/signup";
import { resendVerification, signUp } from "../server/sign-up";
import type { ResendVerificationState, SignUpState } from "../types";

// Public by nature (no session to check): Next has checked the request's Origin, valibot checks
// the fields, and Better Auth rate-limits by client IP.

export async function signUpAction(previous: SignUpState, form: FormData): Promise<SignUpState> {
  const attempt = previous.attempt + 1;
  const values = texts(form, ["name", "email"]);
  // Where the confirmation link goes on to: a path on this server, whatever was posted.
  const next = safeReturnPath(text(form, "next"));
  const parsed = parseForm(SignUpSchema, { ...values, password: text(form, "password") });
  if (!parsed.ok) return { status: "editing", attempt, values, errors: parsed.errors };

  const outcome = await signUp(withCaptcha(callAuth, captchaToken(form)), parsed.value, next);
  switch (outcome.kind) {
    case "sent":
      return { status: "sent", attempt, email: parsed.value.email };
    case "field":
      return { status: "editing", attempt, values, errors: { [outcome.field]: outcome.message } };
    case "failed":
      return { status: "editing", attempt, values, errors: {}, formError: outcome.message };
  }
}

export async function resendVerificationAction(
  previous: ResendVerificationState,
  form: FormData,
): Promise<ResendVerificationState> {
  const attempt = previous.attempt + 1;
  const email = text(form, "email");
  const parsed = parseForm(ResendVerificationSchema, { email });
  if (!parsed.ok) return { status: "editing", attempt, email, error: parsed.errors.email };
  const outcome = await resendVerification(
    withCaptcha(callAuth, captchaToken(form)),
    parsed.value.email,
    safeReturnPath(text(form, "next")),
  );
  return outcome.kind === "sent"
    ? { status: "sent", attempt, email: parsed.value.email }
    : { status: "editing", attempt, email, formError: outcome.message };
}
