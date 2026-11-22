import * as v from "valibot";
import { CurrentPasswordSchema, EmailSchema } from "@/shared/validation/fields";

/** Field order is the order focus moves through on errors. */
export const LoginSchema = v.object({
  email: EmailSchema,
  password: CurrentPasswordSchema,
  // A checkbox: "on" when ticked, absent otherwise.
  rememberMe: v.optional(
    v.pipe(
      v.literal("on"),
      v.transform(() => true),
    ),
    undefined,
  ),
});

export type LoginInput = v.InferOutput<typeof LoginSchema>;
export type LoginField = "email" | "password";
export const LOGIN_FIELDS = ["email", "password"] as const satisfies LoginField[];
