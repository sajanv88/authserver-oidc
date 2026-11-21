import "server-only";
import { authPageHref } from "@/shared/auth/auth-pages";
import {
  authorizeUrlFrom,
  type SearchParamsInput,
  signedOidcQuery,
} from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { getSession, redirectToSafePath } from "@/shared/auth/session";
import type { LoginContext } from "../types";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * What the login page needs, from its query: Better Auth's signed authorization query when an
 * app sent the browser here, or a returnTo from this server's own pages.
 *
 * The sibling pages (magic link, forgot password) carry the signed query or returnTo on.
 *
 * Someone already signed in skips the form: on with the authorization request (unless the app
 * asked for prompt=login, which means sign in again), or to returnTo.
 */
export async function loginPageContext(searchParams: SearchParams): Promise<LoginContext> {
  const query: SearchParamsInput = searchParams;
  const oidcQuery = signedOidcQuery(query);
  const restartUrl = authorizeUrlFrom(query);
  const returnTo = safeReturnPath(searchParams.returnTo);

  if (await getSession()) {
    const reauthenticate = new URLSearchParams(oidcQuery)
      .get("prompt")
      ?.split(" ")
      .includes("login");
    if (restartUrl && !reauthenticate) redirectToSafePath(restartUrl);
    if (!restartUrl) redirectToSafePath(returnTo);
  }

  // What the sibling pages need to carry on from here.
  const carry = oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
  return {
    oidcQuery,
    returnTo,
    restartUrl,
    signUpHref: authPageHref("signup", oidcQuery),
    magicLinkHref: authPageHref("magicLink", carry),
    forgotPasswordHref: authPageHref("forgotPassword", carry),
  };
}
