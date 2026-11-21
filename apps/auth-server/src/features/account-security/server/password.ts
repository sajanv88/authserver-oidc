import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import type { AuthCaller } from "@/shared/auth/endpoint";
import type { ChangePasswordField, ChangePasswordInput } from "../schemas/account";

export type ChangePasswordOutcome =
  | { kind: "changed" }
  | { kind: "field"; field: ChangePasswordField; message: string }
  | { kind: "failed"; message: string };

/**
 * Changes the password through Better Auth (rate limited: 5 tries in 5 minutes). Every other
 * session is signed out; this one gets a new session cookie.
 */
export async function changePassword(
  call: AuthCaller,
  input: ChangePasswordInput,
): Promise<ChangePasswordOutcome> {
  const result = await call({
    path: "/change-password",
    body: {
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      revokeOtherSessions: true,
    },
  });
  if (result.ok) return { kind: "changed" };
  if (result.error.code === "INVALID_PASSWORD") {
    return {
      kind: "field",
      field: "currentPassword",
      message: "That isn't your current password.",
    };
  }
  if (result.error.code === "PASSWORD_TOO_SHORT" || result.error.code === "PASSWORD_TOO_LONG") {
    return {
      kind: "field",
      field: "newPassword",
      message: `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }
  return {
    kind: "failed",
    message: authErrorMessage(
      result.error,
      "We couldn't change your password. Try again in a moment.",
    ),
  };
}
