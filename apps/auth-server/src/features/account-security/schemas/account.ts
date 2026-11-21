import * as v from "valibot";
import type { FieldErrors } from "@/shared/validation/field-errors";
import { CurrentPasswordSchema, NewPasswordSchema } from "@/shared/validation/fields";

/** Changing the password: the current one, then the new one typed twice. */
export const ChangePasswordSchema = v.object({
  currentPassword: CurrentPasswordSchema,
  newPassword: NewPasswordSchema,
  confirmPassword: v.pipe(v.string(), v.nonEmpty("Type the new password again.")),
});

export type ChangePasswordInput = v.InferOutput<typeof ChangePasswordSchema>;
export type ChangePasswordField = keyof ChangePasswordInput;
export const CHANGE_PASSWORD_FIELDS = [
  "currentPassword",
  "newPassword",
  "confirmPassword",
] as const satisfies ChangePasswordField[];

/** The checks across fields, once each is fine on its own. */
export function crossFieldErrors(input: ChangePasswordInput): FieldErrors<ChangePasswordField> {
  if (input.newPassword === input.currentPassword) {
    return { newPassword: "Choose a password different from the current one." };
  }
  if (input.newPassword !== input.confirmPassword) {
    return { confirmPassword: "The passwords don't match. Type the same password twice." };
  }
  return {};
}

/** A session id sent by a "Sign out" button in the session list. */
export const SessionIdSchema = v.pipe(v.string(), v.uuid());
