import "server-only";
import { type SearchParamsInput, signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { configuredSocialProviders } from "@/shared/auth/social-providers";
import { env } from "@/shared/config/env";
import type { SocialSignInContext } from "../types";
import { socialProblem } from "./problems";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * What a sign-in or sign-up page needs for its provider buttons, and its query without the
 * `error` Better Auth added on the way back: it isn't part of the app's signed request, which
 * wouldn't verify with it.
 *
 * No provider configured and nothing to explain: `social` is undefined, and there's no button.
 */
export function socialSignInPageContext(searchParams: SearchParams): {
  query: SearchParams;
  social: SocialSignInContext | undefined;
} {
  const { error, error_description: _description, ...query } = searchParams;
  const code = typeof error === "string" ? error : undefined;
  const providers = configuredSocialProviders(env().social);
  if (providers.length === 0 && !code) return { query, social: undefined };
  const input: SearchParamsInput = query;
  return {
    query,
    social: {
      providers,
      oidcQuery: signedOidcQuery(input),
      returnTo: safeReturnPath(query.returnTo),
      problem: code ? socialProblem(code) : undefined,
    },
  };
}
