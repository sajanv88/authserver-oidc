"use server";

import { signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth } from "@/shared/auth/server-endpoint";
import { configuredSocialProviders } from "@/shared/auth/social-providers";
import { env } from "@/shared/config/env";
import { parseForm } from "@/shared/validation/field-errors";
import { fieldsOf, text } from "@/shared/validation/form-data";
import { SocialSignInSchema } from "../schemas/social-sign-in";
import { socialTargets, startSocialSignIn } from "../server/social-sign-in";
import type { SocialSignInState } from "../types";

// Public by nature, like the sign-in form: Next has checked the Origin, valibot the provider,
// Better Auth rate-limits by client IP and checks the signed OIDC query itself.

export async function socialSignInAction(
  previous: SocialSignInState,
  form: FormData,
): Promise<SocialSignInState> {
  const attempt = previous.attempt + 1;
  const parsed = parseForm(SocialSignInSchema, fieldsOf(form));
  const provider = parsed.ok
    ? configuredSocialProviders(env().social).find((item) => item.id === parsed.value.provider)
    : undefined;
  if (!provider) {
    return { status: "failed", attempt, message: "That way of signing in isn't available." };
  }

  const oidcQuery = signedOidcQuery(text(form, "oidcQuery"));
  const returnTo = safeReturnPath(text(form, "returnTo"));
  const outcome = await startSocialSignIn(
    callAuth,
    { provider: provider.id, ...socialTargets(oidcQuery, returnTo) },
    oidcQuery,
  );
  if (outcome.kind === "failed") return { status: "failed", attempt, message: outcome.message };
  return { status: "leaving", attempt, url: outcome.url, providerName: provider.name };
}
