"use server";

import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth } from "@/shared/auth/server-endpoint";
import { parseForm } from "@/shared/validation/field-errors";
import { text } from "@/shared/validation/form-data";
import { MagicLinkSchema } from "../schemas/magic-link";
import { requestMagicLink } from "../server/magic-link";
import type { MagicLinkState } from "../types";

// Public by nature: Next has checked the Origin, valibot the email; Better Auth rate-limits by
// client IP. Where the link leads is a path on this server, whatever was posted.
export async function requestMagicLinkAction(
  previous: MagicLinkState,
  form: FormData,
): Promise<MagicLinkState> {
  const attempt = previous.attempt + 1;
  const email = text(form, "email");
  const parsed = parseForm(MagicLinkSchema, { email });
  if (!parsed.ok) return { status: "editing", attempt, email, error: parsed.errors.email };
  const outcome = await requestMagicLink(callAuth, {
    email: parsed.value.email,
    callbackURL: safeReturnPath(text(form, "callbackURL")),
    errorCallbackURL: safeReturnPath(text(form, "errorCallbackURL")),
  });
  return outcome.kind === "sent"
    ? { status: "sent", attempt, email: parsed.value.email }
    : { status: "editing", attempt, email, formError: outcome.message };
}
