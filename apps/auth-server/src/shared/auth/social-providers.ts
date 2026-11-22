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

/** Personal Microsoft accounts (outlook.com, hotmail.com…) all sign in from this tenant. */
export const MICROSOFT_CONSUMER_TENANT_ID = "9188040d-6c67-4c5b-b112-36a304b66dad";

const TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);

const claimIsTrue = (value: unknown) => value === true || value === "true" || value === "1";

/**
 * Whether a Microsoft ID token's email can be trusted as the person's (nOAuth). With a
 * multi-tenant app any organisation can sign in, and an organisation's admin can put any
 * address on their users, and on the claims Better Auth reads as "verified". Trusted only:
 * - `xms_edov`: Microsoft checked the email's domain belongs to the user's organisation
 *   (an optional claim, added in the app registration);
 * - a personal Microsoft account, whose address Microsoft itself verified;
 * - the one tenant MICROSOFT_TENANT_ID names, when it names one: the operator's own.
 * Anything else counts as unverified: no account is linked to it, and a new account gets a
 * confirmation email first.
 */
export function microsoftEmailVerified(claims: Record<string, unknown>, tenantId: string): boolean {
  if (typeof claims.email !== "string" || claims.email.length === 0) return false;
  const tid = typeof claims.tid === "string" ? claims.tid.toLowerCase() : "";
  if (claimIsTrue(claims.xms_edov)) return true;
  if (tid === MICROSOFT_CONSUMER_TENANT_ID) return true;
  return !TENANT_ALIASES.has(tenantId.toLowerCase()) && tid === tenantId.toLowerCase();
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
            // Replaces Better Auth's own reading of "verified", which another tenant controls.
            mapProfileToUser: (claims: Record<string, unknown>) => ({
              emailVerified: microsoftEmailVerified(claims, social.microsoft?.tenantId ?? "common"),
            }),
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
