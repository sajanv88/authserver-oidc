import { OIDC_SCOPES } from "./auth-config";

type GrantType = "authorization_code" | "client_credentials" | "refresh_token";

/**
 * What every app that signs people in is registered with, whoever registers it (the admin
 * screen, the seed, the provisioning script): the code flow with PKCE required, refresh
 * tokens, and the OpenID Connect scopes plus any API scopes it was given.
 */
export function oidcClientDefaults(apiScopes: readonly string[] = []) {
  const grantTypes: GrantType[] = ["authorization_code", "refresh_token"];
  const responseTypes: "code"[] = ["code"];
  return {
    grant_types: grantTypes,
    response_types: responseTypes,
    require_pkce: true,
    scope: [...OIDC_SCOPES, ...apiScopes].join(" "),
  };
}

/**
 * A service that calls APIs as itself (a job, a queue consumer): client credentials only,
 * always with a secret, no redirect URIs and no user. `scopes` is the ceiling of what its
 * tokens may carry; the token request picks from it.
 */
export function machineClientDefaults(scopes: readonly string[]) {
  const grantTypes: GrantType[] = ["client_credentials"];
  return {
    grant_types: grantTypes,
    token_endpoint_auth_method: "client_secret_basic" as const,
    scope: scopes.join(" "),
    client_credentials_scopes: [...scopes],
  };
}
