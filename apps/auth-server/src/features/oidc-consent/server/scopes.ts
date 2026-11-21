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

/**
 * The scopes of an authorization request, in words, in the order asked. Unknown ones are left
 * out: the authorize endpoint has already refused any this server doesn't offer.
 */
export function consentScopes(scope: string | null | undefined): ScopeItem[] {
  const asked = [...new Set((scope ?? "").split(" ").filter((value) => value !== ""))];
  return asked.flatMap((value) => {
    const known = SCOPES[value];
    return known ? [{ scope: value, ...known }] : [];
  });
}
