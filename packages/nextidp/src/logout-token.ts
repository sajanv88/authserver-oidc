import { type JWTVerifyGetKey, jwtVerify } from "jose";
import { IdpError } from "./errors.js";
import { signingAlgorithms } from "./id-token.js";
import type { IdpLogout } from "./store.js";

const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";

function invalid(message: string, cause?: unknown): IdpError {
  return new IdpError("invalid_logout_token", message, cause === undefined ? {} : { cause });
}

/**
 * Checks a logout token (OIDC Back-Channel Logout 1.0, 2.6): signed by one of the issuer's
 * keys, `iss` the issuer, `aud` this client, `iat` and `exp` (not expired), the
 * back-channel logout event, a `sid` or a `sub`, and no `nonce`, so an ID token can't pass
 * for one. Its `typ`, when there is one, must be logout+jwt.
 */
export async function verifyLogoutToken(
  token: string,
  keys: JWTVerifyGetKey,
  check: { issuer: string; clientId: string; algorithms?: readonly string[] | undefined },
): Promise<IdpLogout> {
  let verified: Awaited<ReturnType<typeof jwtVerify>>;
  try {
    verified = await jwtVerify(token, keys, {
      algorithms: signingAlgorithms(check.algorithms),
      issuer: check.issuer,
      audience: check.clientId,
      requiredClaims: ["iat", "exp"],
      clockTolerance: 60,
    });
  } catch (cause) {
    throw invalid("The logout token didn't verify.", cause);
  }
  const { payload, protectedHeader } = verified;
  const typ = protectedHeader.typ?.toLowerCase();
  if (typ !== undefined && typ !== "logout+jwt" && typ !== "application/logout+jwt") {
    throw invalid("The token isn't a logout token (typ).");
  }
  const events = payload.events as Record<string, unknown> | undefined;
  const event = events && typeof events === "object" ? events[BACKCHANNEL_LOGOUT_EVENT] : undefined;
  if (!event || typeof event !== "object") {
    throw invalid("The logout token has no back-channel logout event.");
  }
  if ("nonce" in payload) throw invalid("A logout token can't have a nonce.");
  const sid = typeof payload.sid === "string" && payload.sid ? payload.sid : undefined;
  const sub = typeof payload.sub === "string" && payload.sub ? payload.sub : undefined;
  if (!sid && !sub) throw invalid("The logout token names no session (sid) and no one (sub).");
  return { sid, sub };
}
