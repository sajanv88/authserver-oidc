import type { Route } from "next";
import type { FieldErrors } from "@/shared/validation/field-errors";
import type { ResetPasswordField } from "./schemas/password-reset";

/** Where to go once the password is reset: back into the app's flow, or the account. */
export type ResetDestination = { next: string };

export type ForgotPasswordContext = ResetDestination & {
  loginHref: Route;
  /** This page again, with the same query: "Try again" after a link was sent. */
  retryHref: Route;
};

/** /reset-password, after Better Auth has checked the link. */
export type ResetPasswordContext = { forgotPasswordHref: Route } & (
  | ({ status: "ready"; token: string } & ResetDestination)
  | { status: "invalid" }
);

export type ForgotPasswordState =
  | {
      status: "editing";
      attempt: number;
      email: string;
      error?: string | undefined;
      formError?: string | undefined;
    }
  | { status: "sent"; attempt: number; email: string };

export type ResetPasswordState =
  | {
      status: "editing";
      attempt: number;
      errors: FieldErrors<ResetPasswordField>;
      formError?: string | undefined;
    }
  | { status: "done"; attempt: number }
  /** The token was refused when used: expired, or already used. */
  | { status: "expired"; attempt: number };
