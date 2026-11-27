import {
  type AccessToken,
  bearerToken,
  introspect,
  isJwt,
  requireScopes,
  type TokenRequirements,
  tokenRefusal,
  verifyJwtAccessToken,
} from "./access-token.js";
import {
  type ApiConfig,
  type IdpConfig,
  type IdpOptions,
  resolveApiConfig,
  resolveConfig,
  resolveServiceConfig,
} from "./config.js";
import {
  applySetCookies,
  type CookieJar,
  clearCookie,
  parseCookies,
  readCookie,
  writeCookie,
} from "./cookies.js";
import { createDiscovery, type Discovery } from "./discovery.js";
import { IdpError, isIdpError, type SignInErrorCode } from "./errors.js";
import { createIdpHttp, type Http } from "./http.js";
import { createKeys, verifyIdToken } from "./id-token.js";
import { verifyLogoutToken } from "./logout-token.js";
import { challengeFor, randomToken, sameString } from "./pkce.js";
import { safePath } from "./return-path.js";
import { Sealer } from "./sealed.js";
import {
  createServiceTokens,
  type InterceptableClient,
  type ServiceTokenOptions,
  type ServiceTokens,
  type UseServiceTokenOptions,
  useServiceToken,
} from "./service.js";
import {
  FLOW_MAX_AGE,
  FLOW_PURPOSE,
  type Profile,
  parseFlow,
  profileFrom,
  type Session,
  type StoredSession,
  toSession,
} from "./session.js";
import { cookieBackend, type SessionBackend, storeBackend } from "./store.js";
import {
  type Client,
  exchangeCode,
  fetchUserInfo,
  refreshTokens,
  revokeRefreshToken,
  type TokenResponse,
} from "./tokens.js";

/** Where cookies are read from: a request, its headers, or the Cookie header itself. */
export type CookieSource = Request | Headers | string | null | undefined;

/** The session after `refreshIfNeeded`, and what to tell the browser and the rest of the request. */
export type Refreshed = {
  session: Session | null;
  /** Set-Cookie headers for the response: a new session, or the old one expired. */
  setCookies: string[];
  /** The Cookie header the rest of this request should see, when the cookies changed. */
  cookieHeader: string | undefined;
};

/** What `idp()` returns, whatever the framework. */
export type Idp = {
  /** The checked settings. Throws IdpError("misconfigured") naming what's wrong. */
  config(): IdpConfig;
  /**
   * Answers nextidp's routes under `basePath`: `GET /login`, `GET /callback`,
   * `POST /logout`, `POST /refresh`, and with a store `POST /backchannel-logout`. Anything
   * else under it is a 404.
   */
  handler(request: Request): Promise<Response>;
  /** The signed-in session, or null. Doesn't refresh: see `refreshIfNeeded`. */
  getSession(source: CookieSource): Promise<Session | null>;
  /**
   * The session, refreshed first when its access token expires within `leeway` seconds
   * (default 60). Use it where cookies can be written: a proxy, a route handler, middleware.
   */
  refreshIfNeeded(source: CookieSource, options?: { leeway?: number }): Promise<Refreshed>;
  /** The userinfo endpoint's claims for an access token. */
  userInfo(accessToken: string): Promise<Record<string, unknown>>;
  /**
   * The path that starts a sign-in, returning to `returnTo` (a path of this app) after.
   * `prompt` asks the auth server for `login`, `consent` or `select_account` (others are left
   * out); `reauthenticate: false` is for a "Create account" link, which mustn't ask for a
   * password again after a sign-out (see `reauthenticateAfterSignOut`).
   */
  signInPath(returnTo?: string, options?: SignInPathOptions): string;

  /** For an API: the checked settings it needs (issuer and audience). */
  apiConfig(): ApiConfig;
  /**
   * Checks an access token an API was called with: a JWT against the issuer's keys, an
   * opaque one by introspection. Throws IdpError invalid_token (401) or insufficient_scope
   * (403); `tokenErrorResponse` turns either into the answer.
   */
  verifyAccessToken(token: string, requirements?: TokenRequirements): Promise<AccessToken>;
  /** `verifyAccessToken` for an `Authorization` header; none at all is missing_token (401). */
  verifyBearer(
    authorization: string | null | undefined,
    requirements?: TokenRequirements,
  ): Promise<AccessToken>;
  /** The 401 or 403 for a refused token, with its WWW-Authenticate challenge (RFC 6750). */
  tokenErrorResponse(error: IdpError): Response;

  /**
   * This service's own access token (client credentials), to call another API as itself.
   * Kept until a minute before it expires, per scopes and API; calls at the same time share
   * one request. Needs a confidential client: `clientId` and `clientSecret`. Throws
   * IdpError("service_token_failed") when the auth server refuses or doesn't answer.
   *
   * ```ts
   * const token = await auth.serviceToken({ scopes: ["orders:read"], resource: "https://orders.example.com" });
   * ```
   */
  serviceToken(options?: ServiceTokenOptions): Promise<string>;
  /** Forgets a kept service token an API refused (401), so the next call asks for a new one. */
  dropServiceToken(token: string): void;
  /**
   * Puts a service token on every request of a fast-http-client client to the API (the origin
   * of `resource`, or `origins`), and nowhere else; on a 401 it gets a new one and sends the
   * request once more. Returns a function that undoes it.
   *
   * ```ts
   * const orders = createHttp({ baseUrl: "https://orders.example.com" });
   * auth.useServiceToken(orders, { scopes: ["orders:read"], resource: "https://orders.example.com" });
   * ```
   */
  useServiceToken(client: InterceptableClient, options?: UseServiceTokenOptions): () => void;
};

/** What `signInPath` can add to the sign-in link. */
export type SignInPathOptions = {
  /** `login`, `consent` or `select_account`, or several separated by spaces. */
  prompt?: string | undefined;
  /** false: no `prompt=login` from an earlier sign-out (see `reauthenticateAfterSignOut`). */
  reauthenticate?: boolean | undefined;
};

/**
 * The `prompt` values a sign-in link may ask for (OIDC Core 3.1.2.1). `none` isn't one: its
 * errors (login_required, consent_required, interaction_required) would need handling here.
 */
const PROMPTS: ReadonlySet<string> = new Set(["login", "consent", "select_account"]);

/** `prompt` when every value in it is allowed, each once; otherwise nothing at all. */
function promptFrom(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const values = value.split(" ").filter(Boolean);
  if (values.length === 0 || !values.every((each) => PROMPTS.has(each))) return undefined;
  return [...new Set(values)].join(" ");
}

/** How long the marker of a sign-out lasts (reauthenticateAfterSignOut): 30 days. */
const SIGNED_OUT_MAX_AGE = 30 * 24 * 60 * 60;

/** What sign-in and token checks share: one HTTP client, discovery and key set per issuer. */
type Shared = {
  http: Http;
  discovery: () => Promise<Discovery>;
  keys: ReturnType<typeof createKeys>;
};

type State = Shared & {
  config: IdpConfig;
  client: Client;
  sealer: Sealer;
  /** Where sessions are kept: their cookie, or the store. */
  backend: SessionBackend;
  /** Refreshes in progress or just done, by refresh token: see refreshStored. */
  refreshing: Map<string, { result: Promise<StoredSession>; until: number }>;
};

type ApiState = Shared & {
  config: ApiConfig;
  /** Introspection answers, by the token's SHA-256, kept at most a minute. */
  introspected: Map<string, { token: AccessToken; until: number }>;
};

/** How long an introspection answer is kept: a revoked token is refused within a minute. */
const INTROSPECTION_CACHE_MS = 60_000;
const INTROSPECTION_CACHE_SIZE = 1000;

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

/** How long a refresh's result is shared with requests that still carry the old token. */
const REFRESH_SHARE_MS = 30_000;

function cookieHeaderOf(source: CookieSource): string | null {
  if (source === null || source === undefined) return null;
  if (typeof source === "string") return source;
  if (source instanceof Headers) return source.get("cookie");
  return source.headers.get("cookie");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function redirect(location: string, status: 302 | 303, setCookies: readonly string[] = []) {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(null, { status, headers });
}

function plain(status: number, text: string, extra?: Record<string, string>): Response {
  return new Response(text, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

/**
 * A POST that acts on this app's session comes from this app's own pages. Browsers send
 * Origin on every form POST; without one, Sec-Fetch-Site must say same-origin.
 */
function fromThisApp(request: Request, appUrl: string): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === appUrl;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

async function formOf(request: Request): Promise<FormData | undefined> {
  try {
    return await request.formData();
  } catch {
    return undefined;
  }
}

function report(options: IdpOptions, error: IdpError): void {
  if (options.onError) {
    options.onError(error);
    return;
  }
  console.error(`nextidp: ${error.code}: ${error.message}`);
}

/**
 * The client for one app. Settings are checked on first use, not here, so a module that
 * calls `idp()` can be imported where they aren't set (a build). Pass a function to read
 * them only then, too.
 */
export function createIdp(options: IdpOptions | (() => IdpOptions) = {}): Idp {
  let state: State | undefined;
  let apiState: ApiState | undefined;
  let serviceTokens: ServiceTokens | undefined;
  const shared = new Map<string, Shared>();
  let resolvedOptions: IdpOptions | undefined;

  const optionsOf = (): IdpOptions => {
    resolvedOptions ??= typeof options === "function" ? options() : options;
    return resolvedOptions;
  };

  const sharedFor = (issuer: string): Shared => {
    let entry = shared.get(issuer);
    if (!entry) {
      const http = createIdpHttp();
      entry = { http, discovery: createDiscovery(http, issuer), keys: createKeys() };
      shared.set(issuer, entry);
    }
    return entry;
  };

  const ready = (): State => {
    if (state) return state;
    const config = resolveConfig(optionsOf());
    const sealer = new Sealer(config.secrets);
    const settings = {
      sealer,
      cookie: config.cookies.session,
      secure: config.secure,
      maxAge: config.sessionMaxAge,
      clientId: config.clientId,
    };
    state = {
      ...sharedFor(config.issuer),
      config,
      client: { clientId: config.clientId, clientSecret: config.clientSecret },
      sealer,
      backend: config.store ? storeBackend(config.store, settings) : cookieBackend(settings),
      refreshing: new Map(),
    };
    return state;
  };

  const apiReady = (): ApiState => {
    if (apiState) return apiState;
    const config = resolveApiConfig(optionsOf());
    apiState = { ...sharedFor(config.issuer), config, introspected: new Map() };
    return apiState;
  };

  const serviceReady = (): ServiceTokens => {
    if (serviceTokens) return serviceTokens;
    const config = resolveServiceConfig(optionsOf());
    const { http, discovery } = sharedFor(config.issuer);
    serviceTokens = createServiceTokens({ http, discovery, config });
    return serviceTokens;
  };

  const introspectCached = async (s: ApiState, discovery: Discovery, token: string) => {
    const key = await sha256(token);
    const now = Date.now();
    const cached = s.introspected.get(key);
    if (cached && cached.until > now) return cached.token;
    const checked = await introspect(s.http, discovery, s.config, token);
    if (s.introspected.size >= INTROSPECTION_CACHE_SIZE) {
      for (const [old, entry] of s.introspected) if (entry.until <= now) s.introspected.delete(old);
      // Still full: drop the oldest.
      const first = s.introspected.keys().next();
      if (s.introspected.size >= INTROSPECTION_CACHE_SIZE && !first.done) {
        s.introspected.delete(first.value);
      }
    }
    const expires = checked.expiresAt === undefined ? Infinity : checked.expiresAt * 1000;
    s.introspected.set(key, {
      token: checked,
      until: Math.min(now + INTROSPECTION_CACHE_MS, expires),
    });
    return checked;
  };

  const verifyAccessToken = async (token: string, requirements: TokenRequirements = {}) => {
    const s = apiReady();
    const discovery = await s.discovery();
    const checked = isJwt(token)
      ? await verifyJwtAccessToken(token, s.keys(discovery.jwks_uri), s.config)
      : await introspectCached(s, discovery, token);
    return requireScopes(checked, requirements.scopes);
  };

  const fail = (error: unknown): IdpError => {
    const idpError = isIdpError(error)
      ? error
      : new IdpError("token_failed", "Something went wrong.", { cause: error });
    report(optionsOf(), idpError);
    return idpError;
  };

  const errorRedirect = (s: State, code: SignInErrorCode, setCookies: string[]) => {
    const url = new URL(s.config.errorPath, s.config.appUrl);
    url.searchParams.set("error", code);
    return redirect(url.toString(), 303, setCookies);
  };

  const verify = async (s: State, discovery: Discovery, idToken: string, nonce?: string) =>
    verifyIdToken(idToken, s.keys(discovery.jwks_uri), {
      issuer: discovery.issuer,
      clientId: s.config.clientId,
      nonce,
      algorithms: discovery.id_token_signing_alg_values_supported,
    });

  const storedFrom = (
    tokens: TokenResponse,
    claims: Record<string, unknown>,
    previous?: StoredSession,
    profile?: Profile,
  ): StoredSession => {
    const stored: StoredSession = {
      claims,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: nowSeconds() + (tokens.expires_in ?? 0),
    };
    // The server may not send these again: keep what we had.
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken;
    const idToken = tokens.id_token ?? previous?.idToken;
    const scope = tokens.scope ?? previous?.scope;
    // A new profile, else the one from before (userinfo failed, or no new ID token).
    const kept = profile ?? previous?.profile;
    if (refreshToken) stored.refreshToken = refreshToken;
    if (idToken) stored.idToken = idToken;
    if (scope) stored.scope = scope;
    if (kept) stored.profile = kept;
    return stored;
  };

  /**
   * The person's email, name and picture from userinfo (the `userinfo` option). Best effort:
   * a failure is reported and gives nothing, and so does an answer about anyone but `sub`
   * (OIDC Core 5.3.4).
   */
  const profileFor = async (
    s: State,
    discovery: Discovery,
    accessToken: string,
    sub: unknown,
  ): Promise<Profile | undefined> => {
    if (!s.config.userinfo) return undefined;
    try {
      const answer = await fetchUserInfo(s.http, discovery, accessToken);
      if (typeof sub !== "string" || answer.sub !== sub) {
        fail(new IdpError("userinfo_failed", "The userinfo answer is for another subject."));
        return undefined;
      }
      return profileFrom(answer);
    } catch (error) {
      fail(error);
      return undefined;
    }
  };

  /**
   * New tokens for a stored session. The auth server rotates refresh tokens, so two requests
   * refreshing with the same one at once would sign the person out: the second is refused.
   * Requests in this process that carry the same refresh token share one refresh, and its
   * result for 30 seconds.
   */
  const refreshStored = (s: State, stored: StoredSession): Promise<StoredSession> => {
    const refreshToken = stored.refreshToken;
    if (!refreshToken) {
      return Promise.reject(new IdpError("refresh_failed", "There's no refresh token."));
    }
    const now = Date.now();
    for (const [key, entry] of s.refreshing) if (entry.until <= now) s.refreshing.delete(key);
    const shared = s.refreshing.get(refreshToken);
    if (shared) return shared.result;
    const result = (async () => {
      const discovery = await s.discovery();
      const tokens = await refreshTokens(s.http, discovery, s.client, {
        refreshToken,
        resource: s.config.resource,
      });
      let claims = stored.claims;
      let profile: Profile | undefined;
      if (tokens.id_token) {
        // A new ID token must be for the same person (OIDC Core 12.2).
        const fresh = await verify(s, discovery, tokens.id_token);
        if (fresh.sub !== stored.claims.sub) {
          throw new IdpError("refresh_failed", "The refreshed ID token is for someone else.");
        }
        claims = fresh;
        profile = await profileFor(s, discovery, tokens.access_token, fresh.sub);
      }
      return storedFrom(tokens, claims, stored, profile);
    })();
    s.refreshing.set(refreshToken, { result, until: now + REFRESH_SHARE_MS });
    result.catch(() => s.refreshing.delete(refreshToken));
    return result;
  };

  /** A refusal (400, 401) ends the session; a network error or a 5xx keeps it for later. */
  const refusedForGood = (error: IdpError) => error.status === 400 || error.status === 401;

  /**
   * After a refused refresh: the session as it's kept now, if something else refreshed it
   * in the meantime (another instance sharing the store, whose new refresh token we lack).
   */
  const refreshedElsewhere = async (s: State, jar: CookieJar, stale: StoredSession) => {
    const latest = await s.backend.load(jar);
    return latest?.stored.refreshToken && latest.stored.refreshToken !== stale.refreshToken
      ? latest
      : undefined;
  };

  /**
   * The `prompt` for this sign-in, and the Set-Cookie that clears the sign-out marker when
   * it's used up. An allowed `prompt` in the query wins (and uses the marker up if it asks
   * for `login`); `reauthenticate=false` leaves the marker for later; otherwise the marker
   * means `prompt=login`, once.
   */
  function promptOf(s: State, request: Request, url: URL) {
    const { signedOut } = s.config.cookies;
    const jar = parseCookies(request.headers.get("cookie"));
    const marked = jar.has(signedOut);
    const clear = () => clearCookie(jar, signedOut, s.config.secure, s.config.basePath);
    const asked = promptFrom(url.searchParams.get("prompt"));
    if (asked) {
      const usedUp = marked && asked.split(" ").includes("login");
      return { prompt: asked, setCookies: usedUp ? clear() : [] };
    }
    if (url.searchParams.get("reauthenticate") === "false" || !marked) {
      return { prompt: undefined, setCookies: [] };
    }
    return {
      prompt: s.config.reauthenticateAfterSignOut ? "login" : undefined,
      setCookies: clear(),
    };
  }

  async function login(s: State, request: Request, url: URL): Promise<Response> {
    const returnTo = safePath(url.searchParams.get("returnTo")) ?? s.config.afterSignIn;
    const { prompt, setCookies } = promptOf(s, request, url);
    let discovery: Discovery;
    try {
      discovery = await s.discovery();
    } catch (error) {
      fail(error);
      return plain(503, "The sign-in service can't be reached. Try again in a moment.");
    }
    const flow = { verifier: randomToken(), state: randomToken(), nonce: randomToken(), returnTo };
    const authorize = new URL(discovery.authorization_endpoint);
    authorize.search = new URLSearchParams({
      response_type: "code",
      client_id: s.config.clientId,
      redirect_uri: s.config.redirectUri,
      scope: s.config.scope,
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await challengeFor(flow.verifier),
      code_challenge_method: "S256",
      ...(s.config.resource ? { resource: s.config.resource } : {}),
      ...(prompt ? { prompt } : {}),
    }).toString();
    const sealed = await s.sealer.seal(flow, FLOW_PURPOSE, FLOW_MAX_AGE);
    return redirect(authorize.toString(), 302, [
      // Lax: the cookie comes back on the top-level redirect from the auth server.
      ...writeCookie(new Map(), s.config.cookies.flow, sealed, {
        secure: s.config.secure,
        maxAge: FLOW_MAX_AGE,
      }),
      ...setCookies,
    ]);
  }

  async function callback(s: State, request: Request, url: URL): Promise<Response> {
    const jar = parseCookies(request.headers.get("cookie"));
    // The sign-in in progress is used up, whatever happens next.
    const done = clearCookie(jar, s.config.cookies.flow, s.config.secure);
    const flow = parseFlow(
      await s.sealer.unseal(readCookie(jar, s.config.cookies.flow), FLOW_PURPOSE),
    );
    const params = url.searchParams;
    if (!flow) return errorRedirect(s, "expired", done);
    // Only this browser's own sign-in may finish here (CSRF on the redirect URI).
    if (!sameString(params.get("state") ?? "", flow.state)) {
      return errorRedirect(s, "state_mismatch", done);
    }
    const refusal = params.get("error");
    if (refusal) {
      return errorRedirect(s, refusal === "access_denied" ? "access_denied" : "token_failed", done);
    }
    const code = params.get("code");
    if (!code) return errorRedirect(s, "token_failed", done);

    try {
      const discovery = await s.discovery();
      const tokens = await exchangeCode(s.http, discovery, s.client, {
        code,
        verifier: flow.verifier,
        redirectUri: s.config.redirectUri,
        resource: s.config.resource,
      });
      if (!tokens.id_token) {
        throw new IdpError("invalid_id_token", "No ID token came back: was openid asked for?");
      }
      const claims = await verify(s, discovery, tokens.id_token, flow.nonce);
      const profile = await profileFor(s, discovery, tokens.access_token, claims.sub);
      const session = await s.backend.create(jar, storedFrom(tokens, claims, undefined, profile));
      return redirect(new URL(flow.returnTo, s.config.appUrl).toString(), 302, [
        ...done,
        ...session,
      ]);
    } catch (error) {
      const idpError = fail(error);
      const code =
        idpError.code === "invalid_id_token" ? "invalid_id_token" : ("token_failed" as const);
      return errorRedirect(s, code, done);
    }
  }

  async function logout(s: State, request: Request): Promise<Response> {
    if (!fromThisApp(request, s.config.appUrl)) return plain(403, "Forbidden");
    const form = await formOf(request);
    const choice = form?.get("signOutOfIdp");
    const signOutOfIdp =
      choice === "true" ? true : choice === "false" ? false : s.config.signOutOfIdp;
    const jar = parseCookies(request.headers.get("cookie"));
    const stored = (await s.backend.load(jar))?.stored;
    const cleared = [
      ...(await s.backend.remove(jar)),
      // The next sign-in asks for the password again (reauthenticateAfterSignOut).
      ...(s.config.reauthenticateAfterSignOut
        ? writeCookie(new Map(), s.config.cookies.signedOut, "1", {
            secure: s.config.secure,
            maxAge: SIGNED_OUT_MAX_AGE,
            path: s.config.basePath,
          })
        : []),
    ];
    const home = new URL(s.config.afterSignOut, s.config.appUrl).toString();

    let discovery: Discovery | undefined;
    try {
      discovery = await s.discovery();
    } catch (error) {
      fail(error);
    }
    if (discovery && stored?.refreshToken) {
      await revokeRefreshToken(s.http, discovery, s.client, stored.refreshToken);
    }
    if (signOutOfIdp && stored?.idToken && discovery?.end_session_endpoint) {
      // RP-initiated logout: the ID token names the session there and proves the request is
      // ours; the auth server sends the browser back to the registered address.
      const end = new URL(discovery.end_session_endpoint);
      end.search = new URLSearchParams({
        id_token_hint: stored.idToken,
        client_id: s.config.clientId,
        post_logout_redirect_uri: s.config.postLogoutRedirectUri,
      }).toString();
      return redirect(end.toString(), 303, cleared);
    }
    return redirect(home, 303, cleared);
  }

  async function refresh(s: State, request: Request): Promise<Response> {
    if (!fromThisApp(request, s.config.appUrl)) return plain(403, "Forbidden");
    const form = await formOf(request);
    const returnTo = safePath(form?.get("returnTo")) ?? s.config.afterSignIn;
    const jar = parseCookies(request.headers.get("cookie"));
    const loaded = await s.backend.load(jar);
    const back = new URL(returnTo, s.config.appUrl).toString();
    if (!loaded?.stored.refreshToken) return errorRedirect(s, "refresh_failed", []);
    try {
      const next = await refreshStored(s, loaded.stored);
      return redirect(back, 303, await s.backend.update(jar, loaded, next));
    } catch (error) {
      const idpError = fail(error);
      if (!refusedForGood(idpError)) return errorRedirect(s, "refresh_failed", []);
      if (await refreshedElsewhere(s, jar, loaded.stored)) return redirect(back, 303);
      return errorRedirect(s, "refresh_failed", await s.backend.remove(jar));
    }
  }

  /**
   * The auth server ended a session (OIDC Back-Channel Logout 1.0): a POST from it, not a
   * browser, so no Origin check; the signed logout token is the proof. 200 once the app's
   * sessions from it are marked ended, 400 for a token that doesn't verify.
   */
  async function backchannelLogout(s: State, request: Request): Promise<Response> {
    const endIdpSession = s.backend.endIdpSession;
    if (!endIdpSession) return plain(404, "Not found");
    const answer = (status: number, error?: string) =>
      new Response(error ? JSON.stringify({ error }) : null, {
        status,
        headers: { "cache-control": "no-store", "content-type": "application/json" },
      });
    const token = (await formOf(request))?.get("logout_token");
    if (typeof token !== "string" || !token) return answer(400, "invalid_request");
    let logout: Awaited<ReturnType<typeof verifyLogoutToken>>;
    try {
      const discovery = await s.discovery();
      logout = await verifyLogoutToken(token, s.keys(discovery.jwks_uri), {
        issuer: discovery.issuer,
        clientId: s.config.clientId,
        algorithms: discovery.id_token_signing_alg_values_supported,
      });
    } catch (error) {
      fail(error);
      return answer(400, "invalid_request");
    }
    try {
      await endIdpSession(logout);
    } catch (error) {
      fail(error);
      return answer(500, "server_error");
    }
    return answer(200);
  }

  return {
    config: () => ready().config,

    async handler(request) {
      let s: State;
      try {
        s = ready();
      } catch (error) {
        fail(error);
        return plain(500, "Sign-in isn't set up correctly. The server log says why.");
      }
      const url = new URL(request.url);
      const { basePath } = s.config;
      const route = url.pathname.startsWith(`${basePath}/`)
        ? url.pathname.slice(basePath.length)
        : undefined;
      const method = request.method.toUpperCase();
      const only = (allowed: "GET" | "POST", run: () => Promise<Response>) =>
        method === allowed
          ? run()
          : Promise.resolve(plain(405, "Method not allowed", { allow: allowed }));
      switch (route) {
        case "/login":
          return only("GET", () => login(s, request, url));
        case "/callback":
          return only("GET", () => callback(s, request, url));
        case "/logout":
          return only("POST", () => logout(s, request));
        case "/refresh":
          return only("POST", () => refresh(s, request));
        case "/backchannel-logout":
          return only("POST", () => backchannelLogout(s, request));
        default:
          return plain(404, "Not found");
      }
    },

    async getSession(source) {
      const s = ready();
      const loaded = await s.backend.load(parseCookies(cookieHeaderOf(source)));
      return loaded ? toSession(loaded.stored) : null;
    },

    async refreshIfNeeded(source, { leeway = 60 } = {}) {
      const s = ready();
      const header = cookieHeaderOf(source);
      const jar = parseCookies(header);
      const loaded = await s.backend.load(jar);
      const unchanged = (session: Session | null): Refreshed => ({
        session,
        setCookies: [],
        cookieHeader: undefined,
      });
      if (!loaded) return unchanged(null);
      const stored = loaded.stored;
      if (!stored.refreshToken || stored.accessTokenExpiresAt - nowSeconds() > leeway) {
        return unchanged(toSession(stored));
      }
      try {
        const next = await refreshStored(s, stored);
        const setCookies = await s.backend.update(jar, loaded, next);
        return {
          session: toSession(next),
          setCookies,
          cookieHeader: applySetCookies(header, setCookies),
        };
      } catch (error) {
        const idpError = fail(error);
        if (!refusedForGood(idpError)) return unchanged(toSession(stored));
        const elsewhere = await refreshedElsewhere(s, jar, stored);
        if (elsewhere) return unchanged(toSession(elsewhere.stored));
        const setCookies = await s.backend.remove(jar);
        return { session: null, setCookies, cookieHeader: applySetCookies(header, setCookies) };
      }
    },

    async userInfo(accessToken) {
      const s = ready();
      return fetchUserInfo(s.http, await s.discovery(), accessToken);
    },

    apiConfig: () => apiReady().config,

    verifyAccessToken,

    async verifyBearer(authorization, requirements) {
      const token = bearerToken(authorization);
      if (!token) {
        throw new IdpError("missing_token", "An access token is required.", { status: 401 });
      }
      return verifyAccessToken(token, requirements);
    },

    tokenErrorResponse(error) {
      const refusal = tokenRefusal(error);
      return new Response(JSON.stringify(refusal.body), {
        status: refusal.status,
        headers: refusal.headers,
      });
    },

    serviceToken: async (options) => serviceReady().get(options),

    dropServiceToken(token) {
      serviceTokens?.drop(token);
    },

    useServiceToken(client, options) {
      // Settings are checked now, not at the first request: a mistake shows at startup.
      return useServiceToken(serviceReady(), client, options);
    },

    signInPath(returnTo, options = {}) {
      const s = ready();
      const query = new URLSearchParams();
      const safe = safePath(returnTo);
      const prompt = promptFrom(options.prompt);
      if (safe) query.set("returnTo", safe);
      if (prompt) query.set("prompt", prompt);
      if (options.reauthenticate === false) query.set("reauthenticate", "false");
      const login = `${s.config.basePath}/login`;
      return query.size > 0 ? `${login}?${query}` : login;
    },
  };
}
