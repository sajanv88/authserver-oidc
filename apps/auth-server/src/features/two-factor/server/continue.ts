import "server-only";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { type AuthCaller, continuationUrl } from "@/shared/auth/endpoint";
import { authorizeUrlFrom } from "@/shared/auth/oidc-query";

export type ContinueOutcome =
  /** On to where the app's flow goes next: consent, or the app with a code. */
  | { kind: "continue"; url: string }
  /** Two-factor still isn't on: the flow sends them back to set it up. */
  | { kind: "not-yet" }
  /** The signed query expired while they set it up: the app's request, asked again. */
  | { kind: "restart"; url: string };

/**
 * After someone who had to set up two-factor has done it, the app's sign-in that sent them
 * here goes on. The OAuth plugin checks again that it may (postLogin.shouldRedirect, with the
 * session as it is now) before it answers with where to go.
 */
export async function continueAfterSetup(
  call: AuthCaller,
  oauthQuery: string,
): Promise<ContinueOutcome> {
  const result = await call({ path: "/oauth2/continue", body: { postLogin: true }, oauthQuery });
  const url = result.ok ? continuationUrl(result.data) : undefined;
  if (url) {
    const target = new URL(url, "http://local.invalid");
    return target.pathname === SECURITY_PAGES.twoFactor
      ? { kind: "not-yet" }
      : { kind: "continue", url };
  }
  // The signature is only good for a while (LIFETIMES.authorizationCode): ask again, which
  // checks the client, the redirect URI, PKCE and the session from scratch.
  return { kind: "restart", url: authorizeUrlFrom(oauthQuery) ?? "/" };
}
