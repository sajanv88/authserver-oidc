import type { BetterAuthOptions } from "better-auth";
import type { GenericOAuthConfig } from "better-auth/plugins";
import type { SocialConfig } from "@/shared/config/env";

// Signing in with another account: Google, Microsoft, GitHub, and one OpenID Connect provider
// of the operator's choosing (SSO_*). Each is on when its settings are in the environment.
//
// Better Auth links a provider to an existing account only when the provider says the email
// is verified and the account's own email is verified too (its defaults, kept on purpose: an
// unverified sign-up can't be used to take over someone's account). A new account whose email
// the provider hasn't verified gets a confirmation email first, as a sign-up does.

/** The generic OIDC provider's id: its callback is /api/auth/callback/sso. */
export const SSO_PROVIDER_ID = "sso";

export type SocialProviderId = "google" | "microsoft" | "github" | typeof SSO_PROVIDER_ID;

/** A provider as the pages show it: the button, and the account page's list. */
export type SocialProvider = { id: SocialProviderId; name: string };

/** The configured providers, in the order their buttons appear. */
export function configuredSocialProviders(social: SocialConfig): SocialProvider[] {
  return [
    ...(social.google ? [{ id: "google", name: "Google" } as const] : []),
    ...(social.microsoft ? [{ id: "microsoft", name: "Microsoft" } as const] : []),
    ...(social.github ? [{ id: "github", name: "GitHub" } as const] : []),
    ...(social.sso ? [{ id: SSO_PROVIDER_ID, name: social.sso.name } as const] : []),
  ];
}

/** A linked provider's name, even one that has since been switched off. */
export function socialProviderName(id: string, social: SocialConfig): string {
  if (id === SSO_PROVIDER_ID) return social.sso?.name ?? "Single sign-on";
  const names: Record<string, string> = {
    google: "Google",
    microsoft: "Microsoft",
    github: "GitHub",
  };
  return names[id] ?? id;
}

/** Better Auth's built-in providers that are configured. */
export function socialProviderOptions(social: SocialConfig): BetterAuthOptions["socialProviders"] {
  return {
    ...(social.google
      ? {
          google: {
            ...social.google,
            // Lets someone with several Google accounts pick one, instead of the last used.
            prompt: "select_account",
            requireEmailVerification: true,
          },
        }
      : {}),
    ...(social.microsoft
      ? {
          microsoft: {
            ...social.microsoft,
            // Better Auth would otherwise store the Graph photo in the user row, inline.
            disableProfilePhoto: true,
            requireEmailVerification: true,
          },
        }
      : {}),
    ...(social.github ? { github: { ...social.github, requireEmailVerification: true } } : {}),
  };
}

/** The generic OpenID Connect provider, for Better Auth's genericOAuth plugin. */
export function ssoProviderConfig(social: SocialConfig): GenericOAuthConfig[] {
  if (!social.sso) return [];
  const { name, discoveryUrl, clientId, clientSecret } = social.sso;
  return [
    {
      providerId: SSO_PROVIDER_ID,
      name,
      discoveryUrl,
      clientId,
      clientSecret,
      scopes: ["openid", "profile", "email"],
      pkce: true,
      // No usable issuer and keys in discovery: the provider is left out, rather than signing
      // people in on ID tokens nobody checked.
      requireIdTokenVerification: true,
      requireEmailVerification: true,
    },
  ];
}
