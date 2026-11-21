import type { Route } from "next";

/** How the second factor is given at sign-in. */
export type SecondFactorMethod = "totp" | "backup";

/** A failed verification that isn't about the field. */
export type VerifyProblem =
  | { kind: "message"; text: string }
  /** The sign-in this step belongs to has expired (or never started): sign in again. */
  | { kind: "expired" };

export type VerifyState =
  | {
      status: "editing";
      attempt: number;
      error?: string | undefined;
      problem?: VerifyProblem | undefined;
    }
  /** Verified inside an app's flow that goes on at another site: its redirect URI. */
  | { status: "leaving"; attempt: number; url: string };

/** What /two-factor hands its form: plain strings. */
export type TwoFactorPageContext = {
  /** The app's signed authorization query that /login handed over, if any. */
  oidcQuery: string;
  /** Where to go once verified, outside an OIDC flow (already made safe). */
  returnTo: string;
  /** Back to /login, carrying the app's request or returnTo. */
  loginHref: Route;
};

/** A settings form behind the password: what the last attempt came to. */
export type PasswordAttempt = {
  attempt: number;
  /** For the password field ("That isn't your password."). */
  error?: string | undefined;
  /** For the form (rate limited, or something else went wrong). */
  formError?: string | undefined;
};

/** Setting up an authenticator, one step at a time. */
export type SetupStep =
  | ({ step: "password" } & PasswordAttempt)
  | {
      step: "scan";
      attempt: number;
      totpURI: string;
      backupCodes: string[];
      error?: string | undefined;
    }
  | { step: "backup-codes"; attempt: number; backupCodes: string[] };

/** New backup codes, after the password. */
export type BackupCodesState =
  | ({ status: "password" } & PasswordAttempt)
  | { status: "done"; attempt: number; backupCodes: string[] };

/** Turning two-factor off, after the password. */
export type DisableState =
  | ({ status: "password" } & PasswordAttempt)
  | { status: "done"; attempt: number };
