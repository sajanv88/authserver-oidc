"use server";

import { refresh } from "next/cache";
import { callAuth } from "@/shared/auth/server-endpoint";
import { requireSession } from "@/shared/auth/session";
import { parseForm } from "@/shared/validation/field-errors";
import { text } from "@/shared/validation/form-data";
import { ChangePasswordSchema, crossFieldErrors } from "../schemas/account";
import { changePassword } from "../server/password";
import { SECURITY_PATH } from "../server/sessions";
import type { ChangePasswordState } from "../types";

// The session (Next has checked the Origin), valibot, then Better Auth, which checks the
// current password and rate-limits.
export async function changePasswordAction(
  previous: ChangePasswordState,
  form: FormData,
): Promise<ChangePasswordState> {
  await requireSession(SECURITY_PATH);
  const attempt = previous.attempt + 1;
  const parsed = parseForm(ChangePasswordSchema, {
    currentPassword: text(form, "currentPassword"),
    newPassword: text(form, "newPassword"),
    confirmPassword: text(form, "confirmPassword"),
  });
  const errors = parsed.ok ? crossFieldErrors(parsed.value) : parsed.errors;
  if (!parsed.ok || Object.keys(errors).length > 0) return { attempt, errors };

  const outcome = await changePassword(callAuth, parsed.value);
  switch (outcome.kind) {
    case "changed":
      // The session list now has this session only.
      refresh();
      return { attempt, errors: {}, changed: true };
    case "field":
      return { attempt, errors: { [outcome.field]: outcome.message } };
    case "failed":
      return { attempt, errors: {}, formError: outcome.message };
  }
}
