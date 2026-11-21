import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { type AuthCaller, continuationUrl, type EndpointError } from "@/shared/auth/endpoint";
import type { PasswordAttempt, SecondFactorMethod, VerifyProblem } from "../types";

// The two-factor endpoints, as the feature's server actions use them. Each one runs through
// Better Auth's handler (rate limited: 5 tries a minute) with the browser's cookies: the pending
// sign-in cookie for the sign-in step, the session for the settings.

const WRONG_CODE: Record<SecondFactorMethod, string> = {
  totp: "That code didn't match. Check the app shows this account, and try the current code.",
  backup: "That backup code didn't match, or it was already used.",
};

export type VerifyOutcome =
  | { kind: "continue"; url: string }
  | { kind: "verified" }
  | { kind: "field"; message: string }
  | { kind: "problem"; problem: VerifyProblem };

function verifyProblem(error: EndpointError): VerifyProblem {
  if (error.code === "INVALID_TWO_FACTOR_COOKIE") return { kind: "expired" };
  if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") {
    return {
      kind: "message",
      text: "Too many wrong codes. For your safety, wait 15 minutes, then try again.",
    };
  }
  return {
    kind: "message",
    text: authErrorMessage(error, "We couldn't check the code. Try again in a moment."),
  };
}

/**
 * The second step of signing in. Inside an app's flow the signed query goes along, and Better
 * Auth answers with where it goes on (consent, or the app).
 */
export async function verifySecondFactor(
  call: AuthCaller,
  input: { method: SecondFactorMethod; code: string; trustDevice: boolean },
  oauthQuery: string,
): Promise<VerifyOutcome> {
  const result = await call({
    path: input.method === "totp" ? "/two-factor/verify-totp" : "/two-factor/verify-backup-code",
    body: { code: input.code, trustDevice: input.trustDevice },
    oauthQuery,
  });
  if (!result.ok) {
    if (result.error.code === "INVALID_CODE" || result.error.code === "INVALID_BACKUP_CODE") {
      return { kind: "field", message: WRONG_CODE[input.method] };
    }
    return { kind: "problem", problem: verifyProblem(result.error) };
  }
  const url = continuationUrl(result.data);
  return url ? { kind: "continue", url } : { kind: "verified" };
}

/** A settings change behind the password: a wrong password is the field's, the rest the form's. */
function passwordFailure(error: EndpointError, attempt: number): PasswordAttempt {
  if (error.code === "INVALID_PASSWORD") return { attempt, error: "That isn't your password." };
  return {
    attempt,
    formError: authErrorMessage(error, "That didn't work. Try again in a moment."),
  };
}

export type SetupStarted =
  | { ok: true; totpURI: string; backupCodes: string[] }
  | { ok: false; failure: PasswordAttempt };

/** Starts setup: a new secret and backup codes. Two-factor isn't on until a code confirms it. */
export async function startSetup(
  call: AuthCaller,
  password: string,
  attempt: number,
): Promise<SetupStarted> {
  const result = await call({ path: "/two-factor/enable", body: { password } });
  if (!result.ok) return { ok: false, failure: passwordFailure(result.error, attempt) };
  const { totpURI, backupCodes } = result.data;
  if (typeof totpURI !== "string" || !Array.isArray(backupCodes)) {
    return {
      ok: false,
      failure: { attempt, formError: "That didn't work. Try again in a moment." },
    };
  }
  return { ok: true, totpURI, backupCodes: backupCodes.map(String) };
}

/** Confirms the new authenticator with its current code: this turns two-factor on. */
export async function confirmSetup(
  call: AuthCaller,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await call({ path: "/two-factor/verify-totp", body: { code } });
  if (result.ok) return { ok: true };
  return {
    ok: false,
    message:
      result.error.code === "INVALID_CODE"
        ? "That code didn't match. Check the app added this account, and enter its current code."
        : authErrorMessage(result.error, "We couldn't check the code. Try again in a moment."),
  };
}

/** New backup codes; the old ones stop working at once. */
export async function regenerateBackupCodes(
  call: AuthCaller,
  password: string,
  attempt: number,
): Promise<{ ok: true; backupCodes: string[] } | { ok: false; failure: PasswordAttempt }> {
  const result = await call({ path: "/two-factor/generate-backup-codes", body: { password } });
  if (!result.ok) return { ok: false, failure: passwordFailure(result.error, attempt) };
  const codes = result.data.backupCodes;
  return Array.isArray(codes)
    ? { ok: true, backupCodes: codes.map(String) }
    : { ok: false, failure: { attempt, formError: "That didn't work. Try again in a moment." } };
}

/** Turns two-factor off; the backup codes go with it. */
export async function disableTwoFactor(
  call: AuthCaller,
  password: string,
  attempt: number,
): Promise<{ ok: true } | { ok: false; failure: PasswordAttempt }> {
  const result = await call({ path: "/two-factor/disable", body: { password } });
  return result.ok ? { ok: true } : { ok: false, failure: passwordFailure(result.error, attempt) };
}
