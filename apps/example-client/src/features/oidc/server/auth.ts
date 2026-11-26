import { idp } from "nextidp/next";
import { OIDC_SCOPES } from "@/shared/config/app";
import { parseEnv } from "@/shared/config/env-schema";

/**
 * The OIDC client, from nextidp: sign-in with the code flow and PKCE, the ID token checked
 * against the auth server's keys, the session in an encrypted cookie, refresh, and sign-out
 * here or at the auth server too. The settings are this app's EXAMPLE_* ones, read on first
 * use (a build has none).
 *
 * No `server-only` here: proxy.ts imports this, and that marker throws outside a React
 * server render. Nothing on the client imports it.
 */
export const auth = idp(() => {
  const config = parseEnv(process.env);
  return {
    issuer: config.authServerUrl,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    appUrl: config.appUrl,
    secret: config.sessionSecret,
    scopes: OIDC_SCOPES,
    // The redirect URI the seed registers: <appUrl>/oidc/callback.
    basePath: "/oidc",
    afterSignIn: "/me",
  };
});
