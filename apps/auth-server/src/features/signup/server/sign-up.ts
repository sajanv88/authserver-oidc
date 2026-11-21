import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import type { AuthCaller } from "@/shared/auth/endpoint";
import type { SignUpField, SignUpInput } from "../schemas/signup";

/** Better Auth's codes for problems with one field, and which field. */
const FIELD_CODES: Record<string, [SignUpField, string]> = {
  PASSWORD_TOO_SHORT: ["password", `Use at least ${PASSWORD_MIN_LENGTH} characters.`],
  PASSWORD_TOO_LONG: ["password", "Use a shorter password."],
  INVALID_EMAIL: ["email", "Enter an email address like name@example.com."],
};

export type SignUpOutcome =
  | { kind: "sent" }
  | { kind: "field"; field: SignUpField; message: string }
  | { kind: "failed"; message: string };

/** Where the emailed confirmation link lands, signed in, before going on to `next`. */
function confirmationUrl(next: string): string {
  return `${AUTH_PAGES.verifyEmail}?${new URLSearchParams({ next })}`;
}

/**
 * Creates the account and sends the confirmation link. "Sent" whatever the address: Better
 * Auth answers an existing address exactly like a new one (and emails its owner).
 */
export async function signUp(
  call: AuthCaller,
  input: SignUpInput,
  next: string,
): Promise<SignUpOutcome> {
  const result = await call({
    path: "/sign-up/email",
    body: { ...input, callbackURL: confirmationUrl(next) },
  });
  if (result.ok) return { kind: "sent" };
  const field = result.error.code ? FIELD_CODES[result.error.code] : undefined;
  if (field) return { kind: "field", field: field[0], message: field[1] };
  return {
    kind: "failed",
    message: authErrorMessage(
      result.error,
      "We couldn't create your account. Try again in a moment.",
    ),
  };
}

/**
 * Sends a new confirmation link. The same answer whether or not the address is waiting to be
 * confirmed; only the rate limit is said out loud.
 */
export async function resendVerification(
  call: AuthCaller,
  email: string,
  next: string,
): Promise<{ kind: "sent" } | { kind: "failed"; message: string }> {
  const result = await call({
    path: "/send-verification-email",
    body: { email, callbackURL: confirmationUrl(next) },
  });
  if (!result.ok && result.status === 429) {
    return { kind: "failed", message: authErrorMessage(result.error, "") };
  }
  return { kind: "sent" };
}
