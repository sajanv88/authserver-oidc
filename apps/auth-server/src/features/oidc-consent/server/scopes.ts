import { DEFAULT_APP_NAME } from "@/shared/config/app";
import type { ScopeItem } from "../types";

/** What the server offers besides the OIDC scopes, and its name (APP_NAME). */
export type ScopeWording = { apiScopes?: readonly string[]; appName?: string };

// The scopes this server offers (OIDC_SCOPES in auth-config), as people read them.
function oidcScopes(appName: string): Record<string, Omit<ScopeItem, "scope">> {
  return {
    openid: {
      title: "Know it's you",
      description: `Your ${appName} account ID, so the app recognises you next time.`,
    },
    profile: {
      title: "Your name and picture",
      description: "As they're set on your account.",
    },
    email: {
      title: "Your email address",
      description: "And whether you've confirmed it.",
    },
    offline_access: {
      title: "Stay connected",
      description: "Keep access while you're away, until you sign out of the app or remove it.",
    },
  };
}

/** An API scope (OAUTH_API_SCOPES): named by its operator, so said the same way for all. */
function apiScope(scope: string): ScopeItem {
  return {
    scope,
    title: `Act for you in ${scope}`,
    description:
      "Read and change what you can there, with your own permissions, while you're signed in.",
  };
}

/**
 * The scopes of an authorization request, in words, in the order asked. `apiScopes` are the
 * APIs' scopes this server offers (OAUTH_API_SCOPES). Unknown ones are left out: the authorize
 * endpoint has already refused any this server doesn't offer.
 */
export function consentScopes(
  scope: string | null | undefined,
  { apiScopes = [], appName = DEFAULT_APP_NAME }: ScopeWording = {},
): ScopeItem[] {
  const known = oidcScopes(appName);
  const asked = [...new Set((scope ?? "").split(" ").filter((value) => value !== ""))];
  return asked.flatMap((value) => {
    const item = known[value];
    if (item) return [{ scope: value, ...item }];
    return apiScopes.includes(value) ? [apiScope(value)] : [];
  });
}
