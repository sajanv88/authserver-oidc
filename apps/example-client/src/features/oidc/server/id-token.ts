import { createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";
import { sameString } from "./pkce";

const keySets = new Map<string, JWTVerifyGetKey>();

/** The auth server's public keys from its jwks_uri, fetched once and refreshed by jose. */
export function remoteKeys(jwksUri: string): JWTVerifyGetKey {
  let keys = keySets.get(jwksUri);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(jwksUri));
    keySets.set(jwksUri, keys);
  }
  return keys;
}

export type IdTokenCheck = {
  keys: JWTVerifyGetKey;
  issuer: string;
  clientId: string;
  /** The nonce sent with the authorization request. Absent for a token from a refresh. */
  nonce?: string | undefined;
};

/**
 * Verifies an ID token (OIDC Core 3.1.3.7): an RS256 signature by one of the issuer's keys,
 * `iss` the issuer, `aud` this client, not expired, and the nonce this sign-in sent.
 * Throws if anything is off.
 */
export async function verifyIdToken(idToken: string, check: IdTokenCheck): Promise<JWTPayload> {
  const { payload } = await jwtVerify(idToken, check.keys, {
    algorithms: ["RS256"],
    issuer: check.issuer,
    audience: check.clientId,
    requiredClaims: ["sub", "iat", "exp"],
  });
  if (check.nonce !== undefined) {
    if (typeof payload.nonce !== "string" || !sameString(payload.nonce, check.nonce)) {
      throw new Error("The ID token's nonce isn't the one this sign-in sent.");
    }
  }
  return payload;
}
