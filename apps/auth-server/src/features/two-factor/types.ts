import type { Route } from "next";

/** How the second factor is given at sign-in. */
export type SecondFactorMethod = "totp" | "backup";

/** A failed verification that isn't about the field. */
export type VerifyProblem =
  | { kind: "message"; text: string }
  /** The sign-in this step belongs to has expired (or never started): sign in again. */
  | { kind: "expired" };

export type VerifyState =
  | { status: "editing"; error?: string | undefined; problem?: VerifyProblem | undefined }
  | { status: "submitting" }
  | { status: "leaving" };

/** What /two-factor hands its form: plain strings. */
export type TwoFactorPageContext = {
  /** Where to go once verified, outside an OIDC flow (already made safe). */
  returnTo: string;
  /** Back to /login, carrying the app's request or returnTo. */
  loginHref: Route;
};

/** Setting up an authenticator, one step at a time. */
export type SetupStep =
  | { step: "password"; error?: string | undefined; formError?: string | undefined }
  | { step: "scan"; totpURI: string; backupCodes: string[]; error?: string | undefined }
  | { step: "backup-codes"; backupCodes: string[] };
