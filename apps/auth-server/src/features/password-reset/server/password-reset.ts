import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import type { AuthCaller } from "@/shared/auth/endpoint";

/**
 * Asks for a reset link, which lands on /reset-password with ?token= added, keeping `next`.
 * The same answer whether or not the address has an account; only failures are said.
 */
export async function requestReset(
  call: AuthCaller,
  email: string,
  next: string,
): Promise<{ kind: "sent" } | { kind: "failed"; message: string }> {
  const result = await call({
    path: "/request-password-reset",
    body: { email, redirectTo: `${AUTH_PAGES.resetPassword}?${new URLSearchParams({ next })}` },
  });
  if (result.ok) return { kind: "sent" };
  return {
    kind: "failed",
    message: authErrorMessage(result.error, "We couldn't send the link. Try again in a moment."),
  };
}

export type ResetOutcome =
  | { kind: "done" }
  /** The token was refused: expired, or already used. */
  | { kind: "expired" }
  | { kind: "password"; message: string }
  | { kind: "failed"; message: string };

/** Sets the new password with the emailed token: once, and it signs out every session. */
export async function resetPassword(
  call: AuthCaller,
  token: string,
  newPassword: string,
): Promise<ResetOutcome> {
  const result = await call({ path: "/reset-password", body: { token, newPassword } });
  if (result.ok) return { kind: "done" };
  if (result.error.code === "INVALID_TOKEN") return { kind: "expired" };
  if (result.error.code === "PASSWORD_TOO_SHORT" || result.error.code === "PASSWORD_TOO_LONG") {
    return { kind: "password", message: `Use ${PASSWORD_MIN_LENGTH} to 128 characters.` };
  }
  return {
    kind: "failed",
    message: authErrorMessage(
      result.error,
      "We couldn't change your password. Try again in a moment.",
    ),
  };
}
