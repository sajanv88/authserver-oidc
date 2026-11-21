import "server-only";
import { AUTH_PAGES, authPageHref } from "@/shared/auth/auth-pages";
import { authorizeUrlFrom, signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { getSession, redirectToSafePath } from "@/shared/auth/session";
import type { MagicLinkContext } from "../types";

type SearchParams = Record<string, string | string[] | undefined>;

const ACCOUNT_HOME = "/account/security";

/** Where the emailed link goes and comes back to, from the page's query. No session needed. */
export function magicLinkTargets(searchParams: SearchParams): MagicLinkContext {
  const oidcQuery = signedOidcQuery(searchParams);
  const returnTo = safeReturnPath(searchParams.returnTo);
  const carry = oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
  return {
    // The emailed link signs the user in, then goes on: the app's request or returnTo.
    callbackURL:
      authorizeUrlFrom(searchParams, { freshSignIn: true }) ??
      (returnTo === "/" ? ACCOUNT_HOME : returnTo),
    errorCallbackURL: carry ? `${AUTH_PAGES.magicLink}?${carry}` : AUTH_PAGES.magicLink,
    linkFailed: Boolean(searchParams.error),
    loginHref: authPageHref("login", carry),
    retryHref: authPageHref("magicLink", carry),
  };
}

/**
 * What /magic-link needs from its query: the app's signed authorization request or a returnTo
 * (both carried from /login), and `error` when Better Auth sent a failed link back here.
 *
 * Signed in already: on with the app's request (unless it asked for prompt=login), or to
 * returnTo, as on /login.
 */
export async function magicLinkPageContext(searchParams: SearchParams): Promise<MagicLinkContext> {
  if (await getSession()) {
    const restart = authorizeUrlFrom(searchParams);
    const prompt = new URLSearchParams(signedOidcQuery(searchParams)).get("prompt");
    if (restart && !prompt?.split(" ").includes("login")) redirectToSafePath(restart);
    if (!restart) redirectToSafePath(safeReturnPath(searchParams.returnTo));
  }
  return magicLinkTargets(searchParams);
}
