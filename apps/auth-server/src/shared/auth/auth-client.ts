import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { authPageHref } from "./auth-pages";

/**
 * Better Auth in the browser, for the auth forms. They post straight to /api/auth so Better
 * Auth's rate limiter, origin checks and OIDC flow resume apply. Same origin as the pages, so
 * no baseURL.
 *
 * - oauthProviderClient carries the signed OIDC query (`oauth_query`) along with sign-in, so
 *   logging in during an authorization request resumes it.
 * - twoFactorClient sends a password sign-in that needs a second factor to /two-factor,
 *   keeping the page's query.
 * - Better Auth's own redirect plugin follows `{ redirect: true, url }` answers (an OIDC flow
 *   continuing to consent or to the client).
 */
export const authClient = createAuthClient({
  plugins: [
    magicLinkClient(),
    twoFactorClient({
      // To /two-factor with this page's query: the signed OIDC query (so verifying the code
      // resumes the authorization) or the returnTo.
      onTwoFactorRedirect: () => {
        window.location.assign(authPageHref("twoFactor", window.location.search));
      },
    }),
    oauthProviderClient(),
  ],
});
