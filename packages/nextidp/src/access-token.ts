import { decodeProtectedHeader, type JWTVerifyGetKey, jwtVerify } from "jose";
import * as v from "valibot";
import type { ApiConfig } from "./config.js";
import type { Discovery } from "./discovery.js";
import { IdpError } from "./errors.js";
import type { Http } from "./http.js";

// Checking the access tokens an API is called with (RFC 6750 bearer tokens). A JWT (one
// asked for with `resource`, RFC 9068) is checked here against the issuer's keys; an opaque
// one is asked about at the introspection endpoint (RFC 7662).

/** An access token that checked out. */
export type AccessToken = {
  /** `sub`: the person, or for a service calling as itself, its client ID. */
  subject: string | undefined;
  /** The app the token was issued to. */
  clientId: string | undefined;
  /** A service calling as itself (client credentials), not on a person's behalf. */
  isService: boolean;
  scopes: string[];
  audience: string[];
  /** Seconds since the epoch. */
  expiresAt: number | undefined;
  /** Every claim, or every field of the introspection answer. */
  claims: Record<string, unknown>;
};

export type TokenRequirements = {
  /** Every one of these scopes must be granted. */
  scopes?: readonly string[] | undefined;
};

const ACCESS_TOKEN_TYPES = new Set(["at+jwt", "application/at+jwt"]);
const ALGORITHMS = ["RS256", "PS256", "ES256", "EdDSA"];
/** RFC 6750 2.1: b64token. */
const BEARER = /^Bearer +([A-Za-z0-9\-._~+/]+=*)\s*$/i;

const invalid = (message: string, cause?: unknown) =>
  new IdpError("invalid_token", message, { status: 401, cause });

/** The token in an `Authorization: Bearer …` header, or undefined. */
export function bearerToken(authorization: string | null | undefined): string | undefined {
  return authorization ? BEARER.exec(authorization)?.[1] : undefined;
}

function list(value: unknown): string[] {
  if (typeof value === "string") return value.split(" ").filter(Boolean);
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toAccessToken(claims: Record<string, unknown>): AccessToken {
  const subject = typeof claims.sub === "string" ? claims.sub : undefined;
  const clientId =
    typeof claims.client_id === "string"
      ? claims.client_id
      : typeof claims.azp === "string"
        ? claims.azp
        : undefined;
  return {
    subject,
    clientId,
    isService: subject !== undefined && subject === clientId,
    scopes: list(claims.scope),
    audience: list(claims.aud),
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
    claims,
  };
}

/** Throws insufficient_scope (403) unless every required scope was granted. */
export function requireScopes(token: AccessToken, required: readonly string[] = []): AccessToken {
  const missing = required.filter((scope) => !token.scopes.includes(scope));
  if (missing.length > 0) {
    throw new IdpError("insufficient_scope", `The access token lacks: ${missing.join(" ")}.`, {
      status: 403,
      scopes: required,
    });
  }
  return token;
}

/** Whether a token is a JWT (three parts, a header that decodes) rather than opaque. */
export function isJwt(token: string): boolean {
  if (token.split(".").length !== 3) return false;
  try {
    decodeProtectedHeader(token);
    return true;
  } catch {
    return false;
  }
}

/**
 * A JWT access token (RFC 9068): `typ` at+jwt, so no other kind of JWT (an ID token, a logout
 * token) passes for one; a signature by one of the issuer's keys (asymmetric algorithms
 * only); `iss`; `aud` naming this API; and not expired (60 seconds of clock skew).
 */
export async function verifyJwtAccessToken(
  token: string,
  keys: JWTVerifyGetKey,
  config: Pick<ApiConfig, "issuer" | "audience">,
): Promise<AccessToken> {
  const { typ } = decodeProtectedHeader(token);
  if (typ === undefined || !ACCESS_TOKEN_TYPES.has(typ.toLowerCase())) {
    throw invalid("The token isn't a JWT access token (its typ isn't at+jwt).");
  }
  try {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ALGORITHMS,
      issuer: config.issuer,
      audience: config.audience,
      requiredClaims: ["exp"],
      clockTolerance: 60,
    });
    return toAccessToken(payload as Record<string, unknown>);
  } catch (cause) {
    throw invalid(
      "The access token didn't verify: expired, for another API, or not signed by the issuer.",
      cause,
    );
  }
}

const IntrospectionSchema = v.looseObject({
  active: v.boolean(),
  scope: v.optional(v.string()),
  client_id: v.optional(v.string()),
  sub: v.optional(v.string()),
  exp: v.optional(v.number()),
  aud: v.optional(v.union([v.string(), v.array(v.string())])),
  iss: v.optional(v.string()),
});

/**
 * Asks the auth server whether an opaque token is active, with this API's client
 * credentials. The auth server answers only for tokens this client issued, or tokens for an
 * API this client is linked to; to anything else it answers inactive.
 */
export async function introspect(
  http: Http,
  discovery: Discovery,
  config: ApiConfig,
  token: string,
): Promise<AccessToken> {
  if (!discovery.introspection_endpoint) {
    throw invalid("The auth server has no introspection endpoint, and the token isn't a JWT.");
  }
  if (!config.clientId || !config.clientSecret) {
    throw invalid(
      "An opaque access token can only be checked by introspection, which needs clientId and clientSecret. Ask for tokens with `resource` to get JWTs instead.",
    );
  }
  const pair = `${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`;
  let answer: Awaited<ReturnType<Http["postForm"]>>;
  try {
    answer = await http.postForm(
      discovery.introspection_endpoint,
      new URLSearchParams({ token, token_type_hint: "access_token" }),
      { authorization: `Basic ${btoa(pair)}` },
    );
  } catch (cause) {
    throw new IdpError("discovery_failed", "The introspection endpoint didn't answer.", { cause });
  }
  if (!answer.ok) {
    throw new IdpError(
      "misconfigured",
      `Introspection answered ${answer.status}: check clientId and clientSecret.`,
      {
        status: answer.status,
      },
    );
  }
  const parsed = v.safeParse(IntrospectionSchema, answer.data);
  if (!parsed.success) throw invalid("The introspection answer isn't valid.");
  if (!parsed.output.active) throw invalid("The access token isn't active.");
  if (parsed.output.iss !== undefined && parsed.output.iss.replace(/\/+$/, "") !== config.issuer) {
    throw invalid("The access token is from another issuer.");
  }
  const checked = toAccessToken(parsed.output as Record<string, unknown>);
  // For this API; or, only when the API asked for it, issued to this very client.
  const own = config.acceptOwnTokens && checked.clientId === config.clientId;
  if (!checked.audience.includes(config.audience) && !own) {
    throw invalid("The access token is for another API.");
  }
  if (checked.expiresAt !== undefined && checked.expiresAt <= Math.floor(Date.now() / 1000)) {
    throw invalid("The access token has expired.");
  }
  return checked;
}

/** Escapes a value for a quoted-string in WWW-Authenticate. */
function quoted(value: string): string {
  return `"${value.replace(/[\\"]/g, "\\$&")}"`;
}

/**
 * The WWW-Authenticate challenge for a refused request (RFC 6750 3): no error code when
 * there was no token at all, else invalid_token or insufficient_scope with the scopes needed.
 */
export function bearerChallenge(error: IdpError): string {
  if (error.code === "missing_token") return "Bearer";
  const parts = [
    `error=${quoted(error.code === "insufficient_scope" ? "insufficient_scope" : "invalid_token")}`,
  ];
  parts.push(`error_description=${quoted(error.message)}`);
  if (error.code === "insufficient_scope" && error.scopes?.length) {
    parts.push(`scope=${quoted(error.scopes.join(" "))}`);
  }
  return `Bearer ${parts.join(", ")}`;
}

/** The status, challenge and JSON body to answer a refused request with. */
export function tokenRefusal(error: IdpError): {
  status: 401 | 403;
  headers: Record<string, string>;
  body: { error: string; error_description: string };
} {
  const status = error.code === "insufficient_scope" ? 403 : 401;
  return {
    status,
    headers: {
      "www-authenticate": bearerChallenge(error),
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: { error: error.code, error_description: error.message },
  };
}
