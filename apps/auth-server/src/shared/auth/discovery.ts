import "server-only";
import type { Auth } from "./auth-config";

// OIDC discovery at the root of the issuer. Better Auth serves everything under /api/auth, but
// the issuer is the bare origin, so clients look for <issuer>/.well-known/openid-configuration
// and expect the signing keys at <issuer>/jwks. The documents are Better Auth's own, with
// jwks_uri pointed at the root route (same keys as /api/auth/jwks).

const HEADERS = {
  "content-type": "application/json",
  // Shared caches may hold it briefly; clients re-fetch keys on an unknown kid anyway.
  "cache-control": "public, max-age=300",
  "access-control-allow-origin": "*",
};

export function withRootJwksUri<T extends { issuer: string; jwks_uri?: string | undefined }>(
  metadata: T,
): T {
  return { ...metadata, jwks_uri: `${metadata.issuer.replace(/\/$/, "")}/jwks` };
}

export async function openIdConfigurationResponse(auth: Auth, request: Request): Promise<Response> {
  const metadata = await auth.api.getOpenIdConfig({ request, asResponse: false });
  return Response.json(withRootJwksUri(metadata), { headers: HEADERS });
}

export async function authorizationServerMetadataResponse(
  auth: Auth,
  request: Request,
): Promise<Response> {
  const metadata = await auth.api.getOAuthServerConfig({ request, asResponse: false });
  return Response.json(withRootJwksUri(metadata), { headers: HEADERS });
}

export async function jwksResponse(auth: Auth): Promise<Response> {
  return Response.json(await auth.api.getJwks(), { headers: HEADERS });
}
