import "server-only";
import { authPageHref } from "@/shared/auth/auth-pages";
import { authorizeUrlFrom, signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import type { ForgotPasswordContext, ResetPasswordContext } from "../types";

type SearchParams = Record<string, string | string[] | undefined>;

const ACCOUNT_HOME = "/account/security";

/** Where to go after the reset: the app's flow (rebuilt fresh), returnTo, or the account. */
function destination(searchParams: SearchParams): string {
  const resume = authorizeUrlFrom(searchParams);
  if (resume) return resume;
  const returnTo = safeReturnPath(searchParams.returnTo);
  return returnTo === "/" ? ACCOUNT_HOME : returnTo;
}

export function forgotPasswordPageContext(searchParams: SearchParams): ForgotPasswordContext {
  const oidcQuery = signedOidcQuery(searchParams);
  const returnTo = safeReturnPath(searchParams.returnTo);
  const carry = oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
  return {
    next: destination(searchParams),
    loginHref: authPageHref("login", carry),
    retryHref: authPageHref("forgotPassword", carry),
  };
}

/**
 * /reset-password after Better Auth has checked the emailed link: `token` when it's good,
 * `error` when it isn't. `next` came through the email and is made safe again here.
 */
export function resetPasswordPageContext(searchParams: SearchParams): ResetPasswordContext {
  const next = safeReturnPath(searchParams.next);
  const forgotPasswordHref = authPageHref(
    "forgotPassword",
    new URLSearchParams({ returnTo: next }),
  );
  const token = searchParams.token;
  if (typeof token !== "string" || token === "" || searchParams.error) {
    return { status: "invalid", forgotPasswordHref };
  }
  return { status: "ready", token, next, forgotPasswordHref };
}
