import { APP_NAME } from "@/shared/config/app";
import type { ScopeItem } from "../types";

// The scopes this server offers (OIDC_SCOPES in auth-config), as people read them.
const SCOPES: Record<string, Omit<ScopeItem, "scope">> = {
  openid: {
    title: "Know it's you",
    description: `Your ${APP_NAME} account ID, so the app recognises you next time.`,
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
  apiScopes: readonly string[] = [],
): ScopeItem[] {
  const asked = [...new Set((scope ?? "").split(" ").filter((value) => value !== ""))];
  return asked.flatMap((value) => {
    const known = SCOPES[value];
    if (known) return [{ scope: value, ...known }];
    return apiScopes.includes(value) ? [apiScope(value)] : [];
  });
}
