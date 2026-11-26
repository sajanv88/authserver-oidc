import { createRemoteJWKSet, type JWTPayload, type JWTVerifyGetKey, jwtVerify } from "jose";
import { IdpError } from "./errors.js";
import { sameString } from "./pkce.js";

/** Asymmetric algorithms only: never `none`, never an HMAC keyed with something public. */
const ALLOWED_ALGORITHMS = ["RS256", "PS256", "ES256", "EdDSA"];

export type IdTokenCheck = {
  issuer: string;
  clientId: string;
  /** The nonce the authorization request sent. Absent for a token from a refresh. */
  nonce?: string | undefined;
  /** What discovery lists, if anything; narrowed to ALLOWED_ALGORITHMS. */
  algorithms?: readonly string[] | undefined;
};

/** What discovery lists, narrowed to ALLOWED_ALGORITHMS; RS256 when it lists none of them. */
export function signingAlgorithms(listed: readonly string[] | undefined): string[] {
  const algorithms = listed ? listed.filter((alg) => ALLOWED_ALGORITHMS.includes(alg)) : [];
  return algorithms.length > 0 ? algorithms : ["RS256"];
}

/** The issuer's public keys from its jwks_uri: fetched once, again for a new `kid`. */
export function createKeys(): (jwksUri: string) => JWTVerifyGetKey {
  const sets = new Map<string, JWTVerifyGetKey>();
  return (jwksUri) => {
    let keys = sets.get(jwksUri);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(jwksUri), { cooldownDuration: 60_000 });
      sets.set(jwksUri, keys);
    }
    return keys;
  };
}

/**
 * Verifies an ID token (OIDC Core 3.1.3.7): a signature by one of the issuer's keys, `iss`
 * the issuer, `aud` this client (and `azp` too when there are several audiences), `sub`,
 * `iat`, not expired, and the nonce this sign-in sent.
 */
export async function verifyIdToken(
  idToken: string,
  keys: JWTVerifyGetKey,
  check: IdTokenCheck,
): Promise<JWTPayload> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(idToken, keys, {
      algorithms: signingAlgorithms(check.algorithms),
      issuer: check.issuer,
      audience: check.clientId,
      requiredClaims: ["sub", "iat", "exp"],
      clockTolerance: 30,
    }));
  } catch (cause) {
    throw new IdpError("invalid_id_token", "The ID token didn't verify.", { cause });
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if ((audiences.length > 1 || payload.azp !== undefined) && payload.azp !== check.clientId) {
    throw new IdpError("invalid_id_token", "The ID token was issued to another party (azp).");
  }
  if (check.nonce !== undefined) {
    if (typeof payload.nonce !== "string" || !sameString(payload.nonce, check.nonce)) {
      throw new IdpError(
        "invalid_id_token",
        "The ID token's nonce isn't the one this sign-in sent.",
      );
    }
  }
  return payload;
}
