import { OIDC_SCOPES } from "./auth-config";

type GrantType = "authorization_code" | "refresh_token";

/**
 * What every OIDC client of this server is registered with, whoever registers it (the admin
 * screen, the seed): the code flow with PKCE required, refresh tokens, and the scopes offered.
 */
export function oidcClientDefaults() {
  const grantTypes: GrantType[] = ["authorization_code", "refresh_token"];
  const responseTypes: "code"[] = ["code"];
  return {
    grant_types: grantTypes,
    response_types: responseTypes,
    require_pkce: true,
    scope: OIDC_SCOPES.join(" "),
  };
}
