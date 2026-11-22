import * as v from "valibot";
import type { FieldErrors } from "@/shared/validation/field-errors";
import { EmailSchema, NewPasswordSchema } from "@/shared/validation/fields";

export const ForgotPasswordSchema = v.object({ email: EmailSchema });

export type ForgotPasswordInput = v.InferOutput<typeof ForgotPasswordSchema>;

/** Field order is the order focus moves through. */
export const ResetPasswordSchema = v.object({
  password: NewPasswordSchema,
  confirmPassword: v.pipe(v.string(), v.nonEmpty("Type the new password again.")),
});

export type ResetPasswordInput = v.InferOutput<typeof ResetPasswordSchema>;
export type ResetPasswordField = keyof ResetPasswordInput;
export const RESET_PASSWORD_FIELDS = [
  "password",
  "confirmPassword",
] as const satisfies ResetPasswordField[];

/** The second check, once each field is fine on its own: the two must be the same. */
export function mismatchErrors(input: ResetPasswordInput): FieldErrors<ResetPasswordField> {
  return input.password === input.confirmPassword
    ? {}
    : { confirmPassword: "The passwords don't match. Type the same password twice." };
}
