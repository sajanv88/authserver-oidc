import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { authPageHref } from "@/shared/auth/auth-pages";
import type { AuthCaller } from "@/shared/auth/endpoint";
import type { SocialProviderId } from "@/shared/auth/social-providers";

const ACCOUNT_HOME = "/account/security";

export type SocialSignInOutcome =
  | { kind: "redirect"; url: string }
  | { kind: "failed"; message: string };

/**
 * Where the provider's callback goes on to: `returnTo` when it worked, the login page (with
 * what this page was opened with) when it didn't. Inside an app's flow Better Auth goes on
 * with the app's request itself, from the signed query passed as `oauth_query`.
 */
export function socialTargets(oidcQuery: string, returnTo: string) {
  const carry = oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
  return {
    callbackURL: returnTo === "/" ? ACCOUNT_HOME : returnTo,
    errorCallbackURL: authPageHref("login", carry),
  };
}

/**
 * Asks Better Auth for the provider's sign-in address. It sets the state cookie (with the
 * PKCE verifier and nonce behind it) on this browser; the browser then goes to the address.
 */
export async function startSocialSignIn(
  call: AuthCaller,
  input: { provider: SocialProviderId; callbackURL: string; errorCallbackURL: string },
  oauthQuery: string,
): Promise<SocialSignInOutcome> {
  const result = await call({
    path: "/sign-in/social",
    body: { ...input, disableRedirect: true },
    oauthQuery,
  });
  const url = result.ok ? result.data.url : undefined;
  if (typeof url === "string" && /^https?:\/\//.test(url)) return { kind: "redirect", url };
  const fallback = "We couldn't reach that sign-in. Try again in a moment.";
  return {
    kind: "failed",
    message: result.ok ? fallback : authErrorMessage(result.error, fallback),
  };
}
