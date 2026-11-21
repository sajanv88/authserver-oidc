import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import type { AuthCaller } from "@/shared/auth/endpoint";

/**
 * Asks for a sign-in link. Whatever the address, the answer is the same: Better Auth answers
 * alike, and the server sends nothing to unknown addresses or accounts with two-factor on.
 */
export async function requestMagicLink(
  call: AuthCaller,
  input: { email: string; callbackURL: string; errorCallbackURL: string },
): Promise<{ kind: "sent" } | { kind: "failed"; message: string }> {
  const result = await call({ path: "/sign-in/magic-link", body: input });
  if (result.ok) return { kind: "sent" };
  return {
    kind: "failed",
    message: authErrorMessage(result.error, "We couldn't send the link. Try again in a moment."),
  };
}
