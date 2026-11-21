import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { AUTH_PAGES } from "./auth-pages";

/**
 * Better Auth in the browser, for the auth forms. They post straight to /api/auth so Better
 * Auth's rate limiter, origin checks and OIDC flow resume apply. Same origin as the pages, so
 * no baseURL.
 *
 * - oauthProviderClient carries the signed OIDC query (`oauth_query`) along with sign-in, so
 *   logging in during an authorization request resumes it.
 * - twoFactorClient sends a password sign-in that needs a second factor to /two-factor.
 */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({ twoFactorPage: AUTH_PAGES.twoFactor }),
    oauthProviderClient(),
  ],
});
