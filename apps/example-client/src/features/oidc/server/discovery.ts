import * as v from "valibot";

// The auth server's endpoints, from its discovery document (OpenID Connect Discovery 1.0),
// instead of hard-coded paths.

const DiscoverySchema = v.object({
  issuer: v.string(),
  authorization_endpoint: v.pipe(v.string(), v.url()),
  token_endpoint: v.pipe(v.string(), v.url()),
  userinfo_endpoint: v.pipe(v.string(), v.url()),
  jwks_uri: v.pipe(v.string(), v.url()),
  revocation_endpoint: v.optional(v.pipe(v.string(), v.url())),
});

export type Discovery = v.InferOutput<typeof DiscoverySchema>;

/**
 * Checks a discovery document. Its `issuer` must be exactly the issuer it was fetched for
 * (Discovery 4.3), or tokens could be accepted from a server that only claims to be it.
 */
export function parseDiscovery(document: unknown, expectedIssuer: string): Discovery {
  const discovery = v.parse(DiscoverySchema, document);
  if (discovery.issuer !== expectedIssuer) {
    throw new Error("The discovery document names a different issuer.");
  }
  return discovery;
}

const cache = new Map<string, { discovery: Discovery; until: number }>();

/** The issuer's discovery document, kept for an hour. */
export async function discover(issuer: string): Promise<Discovery> {
  const cached = cache.get(issuer);
  if (cached && cached.until > Date.now()) return cached.discovery;
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`Discovery failed with ${response.status}.`);
  const discovery = parseDiscovery(await response.json(), issuer);
  cache.set(issuer, { discovery, until: Date.now() + 3_600_000 });
  return discovery;
}
