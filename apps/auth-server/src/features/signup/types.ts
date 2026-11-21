import type { FieldErrors } from "@/shared/validation/field-errors";
import type { SignUpField } from "./schemas/signup";

/** What a sign-up attempt came to, as the form shows it. */
export type SignUpState =
  | {
      status: "editing";
      /** Counts the answers, so the form remounts with `values` after each one. */
      attempt: number;
      /** What was typed, except the password. */
      values: { name: string; email: string };
      errors: FieldErrors<SignUpField>;
      formError?: string | undefined;
    }
  | { status: "sent"; attempt: number; email: string };

export type ResendVerificationState =
  | {
      status: "editing";
      attempt: number;
      email: string;
      error?: string | undefined;
      formError?: string | undefined;
    }
  | { status: "sent"; attempt: number; email: string };

/** What the sign-up page hands its form: plain strings, so it crosses to the client. */
export type SignUpContext = {
  /** Better Auth's signed authorization query, when sign-up started in an OIDC flow. */
  oidcQuery: string;
  /** Where to go once the email is confirmed: the resumed authorization, or the account. */
  next: string;
};
