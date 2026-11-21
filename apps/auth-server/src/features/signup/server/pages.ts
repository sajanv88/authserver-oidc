import "server-only";
import {
  authorizeUrlFrom,
  type SearchParamsInput,
  signedOidcQuery,
} from "@/shared/auth/oidc-query";
import { getSession, redirectToSafePath } from "@/shared/auth/session";
import type { SignUpContext } from "../types";

const ACCOUNT_HOME = "/account/security";

/**
 * What the sign-up page needs. Someone already signed in doesn't need it: they go on with the
 * authorization request they came with, or to their account.
 */
export async function signUpPageContext(searchParams: SearchParamsInput): Promise<SignUpContext> {
  const resume = authorizeUrlFrom(searchParams);
  if (await getSession()) redirectToSafePath(resume ?? ACCOUNT_HOME);
  return { oidcQuery: signedOidcQuery(searchParams), next: resume ?? ACCOUNT_HOME };
}

/**
 * Where a confirmation link lands, after Better Auth has checked it. Confirmed (and signed in):
 * on to `next`. Otherwise Better Auth added `error`, and the page explains and offers a new
 * link that comes back to the same `next`.
 */
export async function verifyEmailPageContext(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<{ next: string }> {
  const next = typeof searchParams.next === "string" ? searchParams.next : ACCOUNT_HOME;
  if (!searchParams.error) redirectToSafePath(next);
  return { next };
}
