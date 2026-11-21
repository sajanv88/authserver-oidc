import * as v from "valibot";
import { EmailSchema, NameSchema, NewPasswordSchema } from "@/shared/validation/fields";

/** The sign-up form. Field order is the order focus moves through on errors. */
export const SignUpSchema = v.object({
  name: NameSchema,
  email: EmailSchema,
  password: NewPasswordSchema,
});

export type SignUpInput = v.InferOutput<typeof SignUpSchema>;
export type SignUpField = keyof SignUpInput;
export const SIGN_UP_FIELDS = ["name", "email", "password"] as const satisfies SignUpField[];

/** Asking for a new verification link. */
export const ResendVerificationSchema = v.object({ email: EmailSchema });

export type ResendVerificationInput = v.InferOutput<typeof ResendVerificationSchema>;
