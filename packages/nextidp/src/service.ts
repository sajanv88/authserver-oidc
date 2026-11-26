// A service's own access tokens (client credentials): asked for once, kept until shortly
// before they expire, one request at a time per scopes and API. And the hook that puts them
// on every request of a fast-http-client client to that API, renewing one the API refused.
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

export type UseServiceTokenOptions = Omit<ServiceTokenOptions, "fresh"> & {
  /**
   * The origins the token may be sent to, like `https://orders.example.com`. Default: the
   * origin of `resource` (or IDP_RESOURCE). A request anywhere else goes out untouched, with
   * no token: a URL from elsewhere must never carry this service's token away.
   */
  origins?: readonly string[] | undefined;
};

type RequestConfigLike = {
  url: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  retried?: boolean;
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

type Issued = { token: string; until: number };
type Kept = { pending: Promise<Issued>; issued?: Issued };

/** How long before its expiry a kept token is renewed: a minute, or half a short lifetime. */
const RENEW_BEFORE_S = 60;
const MAX_KEPT = 100;

function misconfigured(problem: string): IdpError {
  return new IdpError("misconfigured", `nextidp is misconfigured: ${problem}.`);
}

/** The scopes as the token endpoint gets them, sorted, so the same set is one key. */
function scopeOf(scopes: readonly string[] | undefined): string | undefined {
  const list = [...new Set((scopes ?? []).map((scope) => scope.trim()).filter(Boolean))];
  if (list.some((scope) => /\s/.test(scope))) throw misconfigured("a scope can't hold spaces");
  return list.length > 0 ? list.sort().join(" ") : undefined;
}

function resourceOf(resource: string | undefined): string | undefined {
  if (resource === undefined) return undefined;
  if (!URL.canParse(resource) || /\s/.test(resource)) {
    throw misconfigured("resource must be an absolute URI");
  }
  return resource; // as written: the auth server compares resources as strings
}

export type ServiceTokens = {
  get(options?: ServiceTokenOptions): Promise<string>;
  drop(token: string): void;
  /** The API a token is for when a call names none (IDP_RESOURCE). */
  defaultResource: string | undefined;
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
      // Unambiguous, whatever the two hold.
      const key = JSON.stringify([resource ?? null, scope ?? null]);
      const now = Date.now();
      const known = kept.get(key);
      if (known && !options.fresh) {
        if (!known.issued) return (await known.pending).token;
        if (known.issued.until > now) return known.issued.token;
      }
      if (kept.size >= MAX_KEPT) prune(now);
      const entry: Kept = { pending: issue(scope, resource) };
      // Marked issued before any caller gets the token, so a drop() of it always finds it.
      entry.pending.then(
        (issued) => {
          entry.issued = issued;
        },
        () => undefined,
      );
      kept.set(key, entry);
      try {
        return (await entry.pending).token;
      } catch (error) {
        // A refusal isn't kept: the next call asks again.
        if (kept.get(key) === entry) kept.delete(key);
        throw error;
      }
    },

    drop(token) {
      for (const [key, entry] of kept) if (entry.issued?.token === token) kept.delete(key);
    },

    defaultResource: deps.config.resource,
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

/** The origin a request goes to, or undefined when it can't be told (no token then). */
function originOf(config: RequestConfigLike): string | undefined {
  try {
    return new URL(config.url, config.baseUrl).origin;
  } catch {
    return undefined;
  }
}

/** Where the token may go: `origins`, else the origin of an http(s) resource. */
function allowedOrigins(tokens: ServiceTokens, options: UseServiceTokenOptions): Set<string> {
  const resource = options.resource ?? tokens.defaultResource;
  const listed = options.origins ?? (resource && /^https?:\/\//i.test(resource) ? [resource] : []);
  const origins = new Set<string>();
  for (const value of listed) {
    const url = URL.canParse(value) ? new URL(value) : undefined;
    if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
      throw misconfigured("useServiceToken's origins must be http(s) URLs");
    }
    origins.add(url.origin);
  }
  if (origins.size === 0) {
    throw misconfigured(
      "useServiceToken needs origins, or an http(s) resource, to know where the token may go",
    );
  }
  return origins;
}

/** The headers without any Authorization, whatever its case: ours replaces it. */
function withoutAuthorization(headers: Record<string, string> | undefined) {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([name]) => name.toLowerCase() !== "authorization"),
  );
}

/**
 * Puts a service token on every request of `client` to the allowed origins, and nowhere else.
 * When the API answers 401, the token is dropped and the request sent once more with a new
 * one (a token revoked early); a second 401 is the caller's. Returns a function that takes
 * both hooks off.
 */
export function useServiceToken(
  tokens: ServiceTokens,
  client: InterceptableClient,
  options: UseServiceTokenOptions = {},
): () => void {
  const origins = allowedOrigins(tokens, options);
  const { origins: _listed, ...tokenOptions } = options;
  const allowed = (config: RequestConfigLike) => {
    const origin = originOf(config);
    return origin !== undefined && origins.has(origin);
  };

  const stopRequest = client.interceptors.request.use(async (config) =>
    allowed(config)
      ? {
          ...config,
          headers: {
            ...withoutAuthorization(config.headers),
            authorization: `Bearer ${await tokens.get(tokenOptions)}`,
          },
        }
      : config,
  );
  const stopResponse = client.interceptors.response.use({
    async onRejected(error) {
      const config = configOf(error);
      if (statusOf(error) !== 401 || !config || config.retried || !allowed(config)) throw error;
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
