import * as v from "valibot";
import { IdpError } from "./errors.js";
import type { Http } from "./http.js";

// The auth server's endpoints, from its discovery document (OpenID Connect Discovery 1.0),
// instead of hard-coded paths.

const Url = v.pipe(v.string(), v.url());

const DiscoverySchema = v.object({
  issuer: v.string(),
  authorization_endpoint: Url,
  token_endpoint: Url,
  jwks_uri: Url,
  userinfo_endpoint: v.optional(Url),
  revocation_endpoint: v.optional(Url),
  /** RFC 7662: whether an opaque access token is active, asked with a client's credentials. */
  introspection_endpoint: v.optional(Url),
  /** RP-initiated logout: where to send someone to sign out of the auth server too. */
  end_session_endpoint: v.optional(Url),
  id_token_signing_alg_values_supported: v.optional(v.array(v.string())),
});

export type Discovery = v.InferOutput<typeof DiscoverySchema>;

const ONE_HOUR = 60 * 60 * 1000;

/**
 * Checks a discovery document. Its `issuer` must be the issuer it was fetched for (Discovery
 * 4.3), or tokens could be accepted from a server that only claims to be it.
 */
export function parseDiscovery(document: unknown, expectedIssuer: string): Discovery {
  const parsed = v.safeParse(DiscoverySchema, document);
  if (!parsed.success) {
    throw new IdpError("discovery_failed", "The discovery document is missing endpoints.");
  }
  if (parsed.output.issuer.replace(/\/+$/, "") !== expectedIssuer) {
    throw new IdpError("discovery_failed", "The discovery document names a different issuer.");
  }
  return parsed.output;
}

/** The issuer's discovery document, fetched once an hour; concurrent callers share a fetch. */
export function createDiscovery(http: Http, issuer: string): () => Promise<Discovery> {
  let cached: { value: Promise<Discovery>; until: number } | undefined;
  return () => {
    if (cached && cached.until > Date.now()) return cached.value;
    const value = (async () => {
      let answer: Awaited<ReturnType<Http["get"]>>;
      try {
        answer = await http.get(`${issuer}/.well-known/openid-configuration`);
      } catch (cause) {
        throw new IdpError("discovery_failed", "The auth server didn't answer.", { cause });
      }
      if (!answer.ok) {
        throw new IdpError("discovery_failed", `Discovery answered ${answer.status}.`, {
          status: answer.status,
        });
      }
      return parseDiscovery(answer.data, issuer);
    })();
    cached = { value, until: Date.now() + ONE_HOUR };
    // A failure isn't kept: the next request tries again.
    value.catch(() => {
      if (cached?.value === value) cached = undefined;
    });
    return value;
  };
}
