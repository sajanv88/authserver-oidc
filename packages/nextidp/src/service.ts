// A service's own access tokens (client credentials): asked for once, kept until shortly
// before they expire, one request at a time per scopes and API. And the hook that puts them
// on every request of a fast-http-client client, renewing one an API refused.
import { bearerToken } from "./access-token.js";
import type { ServiceConfig } from "./config.js";
import type { Discovery } from "./discovery.js";
import { IdpError } from "./errors.js";
import type { Http } from "./http.js";
import { clientCredentials } from "./tokens.js";

export type ServiceTokenOptions = {
  /** The scopes to ask for (default: none, so the auth server decides). */
  scopes?: readonly string[] | undefined;
  /** The API the token is for (RFC 8707). Default `resource` (IDP_RESOURCE), if set. */
  resource?: string | undefined;
  /** Ask for a new token even if one is kept. */
  fresh?: boolean | undefined;
};

/**
 * What `useServiceToken` needs of an HTTP client: fast-http-client's `createHttp()` has it.
 * Written out rather than imported, so a client from another version of it fits too.
 */
export type InterceptableClient = {
  request(config: RequestConfigLike): Promise<unknown>;
  interceptors: {
    request: { use(fn: (config: RequestConfigLike) => Promise<RequestConfigLike>): () => void };
    response: { use(handlers: { onRejected?: (error: unknown) => unknown }): () => void };
  };
};

type RequestConfigLike = { url: string; headers?: Record<string, string>; retried?: boolean };

type Issued = { token: string; until: number };
type Kept = { pending: Promise<Issued>; issued?: Issued };

/** How long before its expiry a kept token is renewed: a minute, or half a short lifetime. */
const RENEW_BEFORE_S = 60;
const MAX_KEPT = 100;

/** The scopes as the token endpoint gets them, and the key a token is kept under. */
function scopeOf(scopes: readonly string[] | undefined): string | undefined {
  const list = [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
  if (list.some((scope) => /\s/.test(scope))) {
    throw new IdpError("misconfigured", "nextidp is misconfigured: a scope can't hold spaces.");
  }
  return list.length > 0 ? list.sort().join(" ") : undefined;
}

function resourceOf(resource: string | undefined): string | undefined {
  if (resource === undefined) return undefined;
  try {
    new URL(resource);
    return resource; // as written: the auth server compares resources as strings
  } catch {
    throw new IdpError(
      "misconfigured",
      "nextidp is misconfigured: resource must be an absolute URI.",
    );
  }
}

export type ServiceTokens = {
  get(options?: ServiceTokenOptions): Promise<string>;
  drop(token: string): void;
};

export function createServiceTokens(deps: {
  http: Http;
  discovery: () => Promise<Discovery>;
  config: ServiceConfig;
}): ServiceTokens {
  const kept = new Map<string, Kept>();
  const client = { clientId: deps.config.clientId, clientSecret: deps.config.clientSecret };

  const issue = async (scope: string | undefined, resource: string | undefined) => {
    const tokens = await clientCredentials(deps.http, await deps.discovery(), client, {
      scope,
      resource,
    });
    const lifetime = tokens.expires_in ?? 0;
    const renewIn = lifetime - Math.min(RENEW_BEFORE_S, lifetime / 2);
    return { token: tokens.access_token, until: Date.now() + Math.max(0, renewIn) * 1000 };
  };

  const prune = (now: number) => {
    for (const [key, entry] of kept) {
      if (entry.issued && entry.issued.until <= now) kept.delete(key);
    }
    // Still full (every one in flight or fresh): the oldest goes.
    const oldest = kept.keys().next();
    if (kept.size >= MAX_KEPT && !oldest.done) kept.delete(oldest.value);
  };

  return {
    async get(options = {}) {
      const scope = scopeOf(options.scopes);
      const resource = resourceOf(options.resource ?? deps.config.resource);
      const key = `${resource ?? ""} ${scope ?? ""}`;
      const now = Date.now();
      const known = kept.get(key);
      if (known && !options.fresh) {
        if (!known.issued) return (await known.pending).token;
        if (known.issued.until > now) return known.issued.token;
      }
      if (kept.size >= MAX_KEPT) prune(now);
      const entry: Kept = { pending: issue(scope, resource) };
      kept.set(key, entry);
      try {
        entry.issued = await entry.pending;
        return entry.issued.token;
      } catch (error) {
        // A refusal isn't kept: the next call asks again.
        if (kept.get(key) === entry) kept.delete(key);
        throw error;
      }
    },

    drop(token) {
      for (const [key, entry] of kept) if (entry.issued?.token === token) kept.delete(key);
    },
  };
}

/** The HTTP status of an error from an HTTP client, by shape (fast-http-client's HttpError). */
function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

function configOf(error: unknown): RequestConfigLike | undefined {
  const config = (error as { config?: unknown } | null)?.config;
  return config &&
    typeof config === "object" &&
    typeof (config as { url?: unknown }).url === "string"
    ? (config as RequestConfigLike)
    : undefined;
}

/** The headers without any Authorization, whatever its case: ours replaces it. */
function withoutAuthorization(headers: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== "authorization"),
  );
}

/**
 * Puts a service token on every request of `client`. When an API answers 401, the token is
 * dropped and the request sent once more with a new one (a token revoked or rotated early);
 * a second 401 is the caller's. Returns a function that takes both hooks off.
 */
export function useServiceToken(
  tokens: ServiceTokens,
  client: InterceptableClient,
  options: Omit<ServiceTokenOptions, "fresh"> = {},
): () => void {
  const stopRequest = client.interceptors.request.use(async (config) => ({
    ...config,
    headers: {
      ...withoutAuthorization(config.headers),
      authorization: `Bearer ${await tokens.get(options)}`,
    },
  }));
  const stopResponse = client.interceptors.response.use({
    async onRejected(error) {
      const config = configOf(error);
      if (statusOf(error) !== 401 || !config || config.retried) throw error;
      const refused = bearerToken(
        Object.entries(config.headers ?? {}).find(
          ([name]) => name.toLowerCase() === "authorization",
        )?.[1],
      );
      if (refused) tokens.drop(refused);
      // Through the request hooks again, so the new token goes on.
      return client.request({ ...config, retried: true });
    },
  });
  return () => {
    stopRequest();
    stopResponse();
  };
}
