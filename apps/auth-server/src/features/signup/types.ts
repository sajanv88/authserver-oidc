import type { FieldErrors } from "@/shared/validation/field-errors";
import type { SignUpField } from "./schemas/signup";

/** Where the sign-up form is. One at a time, so impossible mixes can't happen. */
export type SignUpState =
  | { status: "editing"; errors: FieldErrors<SignUpField>; formError?: string }
  | { status: "submitting" }
  | { status: "sent"; email: string };

/** What the sign-up page hands its form: plain strings, so it crosses to the client. */
export type SignUpContext = {
  /** Better Auth's signed authorization query, when sign-up started in an OIDC flow. */
  oidcQuery: string;
  /** Where to go once the email is confirmed: the resumed authorization, or the account. */
  next: string;
};
