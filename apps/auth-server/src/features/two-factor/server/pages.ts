import "server-only";
import { authPageHref } from "@/shared/auth/auth-pages";
import { authorizeUrlFrom, signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { getSession, redirectToSafePath } from "@/shared/auth/session";
import type { TwoFactorPageContext } from "../types";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * What /two-factor needs from its query, which login handed over unchanged: the app's signed
 * authorization request (the form sends it along so verifying resumes the flow) or a returnTo.
 * Already signed in: nothing to verify, so on with the request or to returnTo.
 */
export async function twoFactorPageContext(
  searchParams: SearchParams,
): Promise<TwoFactorPageContext> {
  const oidcQuery = signedOidcQuery(searchParams);
  const returnTo = safeReturnPath(searchParams.returnTo);
  if (await getSession()) redirectToSafePath(authorizeUrlFrom(searchParams) ?? returnTo);
  const carry = oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
  return { returnTo, loginHref: authPageHref("login", carry) };
}
