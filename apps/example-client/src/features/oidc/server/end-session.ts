import type { ExampleEnv } from "@/shared/config/env-schema";

/**
 * The auth server's end-session endpoint for this ID token (OIDC RP-Initiated Logout 1.0):
 * it ends the session there and sends the browser back to `postLogoutRedirectUri`, which the
 * client registered. The ID token names the session (`sid`) and proves the request is ours.
 */
export function endSessionUrl(
  endpoint: string,
  config: Pick<ExampleEnv, "clientId" | "postLogoutRedirectUri">,
  idToken: string,
): URL {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    id_token_hint: idToken,
    client_id: config.clientId,
    post_logout_redirect_uri: config.postLogoutRedirectUri,
  }).toString();
  return url;
}
