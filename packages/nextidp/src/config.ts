import { IdpError } from "./errors.js";
import { safePath } from "./return-path.js";
import type { SessionStore } from "./store.js";

/** What `idp()` takes. Every setting can also come from the environment (in brackets). */
export type IdpOptions = {
  /** The auth server, also the OIDC issuer: `https://auth.example.com` (IDP_ISSUER). */
  issuer?: string | undefined;
  /** This app's client ID, from the auth server's admin screen (IDP_CLIENT_ID). */
  clientId?: string | undefined;
  /** A confidential client's secret. Leave it out for a public one (IDP_CLIENT_SECRET). */
  clientSecret?: string | undefined;
  /** This app's own origin: `https://app.example.com` (IDP_APP_URL). */
  appUrl?: string | undefined;
  /**
   * At least 32 characters: encrypts this app's cookies (IDP_SECRET). A list rotates it: the
   * first encrypts, every one decrypts (IDP_SECRET, comma-separated).
   */
  secret?: string | readonly string[] | undefined;
  /** What to ask for. Default `openid profile email offline_access` (IDP_SCOPES). */
  scopes?: string | readonly string[] | undefined;
  /** An API's URI (RFC 8707): the access token is then a JWT for that API (IDP_RESOURCE). */
  resource?: string | undefined;
  /**
   * For an API that checks tokens: its own URI, as the auth server lists it in
   * OAUTH_RESOURCES. Every access token must name it in `aud` (IDP_AUDIENCE). Never taken
   * from `resource`: that's the API an app asks tokens *for*, and accepting those here would
   * let an app take tokens meant for the API it calls.
   */
  audience?: string | undefined;
  /**
   * Also accept an opaque token, by introspection, that doesn't name `audience` but was
   * issued to this very client (`clientId`): an app checking its own tokens. Off by default,
   * so only tokens for this API pass.
   */
  acceptOwnTokens?: boolean | undefined;
  /** Where nextidp's routes live. Default `/auth`: the redirect URI is `<appUrl>/auth/callback`. */
  basePath?: string | undefined;
  /** Where a sign-in lands when it wasn't asked to return somewhere. Default `/`. */
  afterSignIn?: string | undefined;
  /** Where sign-out lands, and the post-logout redirect URI on the auth server. Default `/`. */
  afterSignOut?: string | undefined;
  /** Where a failed sign-in lands, with `?error=<code>`. Default `/`. */
  errorPath?: string | undefined;
  /** Sign out of the auth server too, by default. A form field can still choose. Default false. */
  signOutOfIdp?: boolean | undefined;
  /**
   * After someone signs out of this app, the next sign-in asks for their password again
   * (`prompt=login`), even while their session at the auth server is still live: on a shared
   * computer, the next person isn't signed in as them. A small cookie remembers the sign-out.
   * A sign-in link opts out with `?reauthenticate=false` (a "Create account" link). Default
   * false.
   */
  reauthenticateAfterSignOut?: boolean | undefined;
  /**
   * Also read the email, name and picture from the userinfo endpoint after sign-in (and after
   * a refresh that brings a new ID token), for auth servers that leave them out of the ID
   * token. Best effort: if it fails, the sign-in goes ahead with what the ID token had, and
   * `onError` is told. Costs one more request. Default false.
   */
  userinfo?: boolean | undefined;
  /** How long the session cookie lasts, in seconds, renewed at every refresh. Default 7 days. */
  sessionMaxAge?: number | undefined;
  /** The start of this app's cookie names. Default `nextidp`. */
  cookiePrefix?: string | undefined;
  /**
   * Keep sessions here instead of in the cookie, which then holds only a sealed reference.
   * Needed for back-channel logout (`<basePath>/backchannel-logout`): the auth server can
   * then end this app's sessions. Default: none, sessions live in the cookie.
   */
  store?: SessionStore | undefined;
  /**
   * Where the IDP_* settings are read from, when an option isn't passed. Default
   * `process.env`.
   */
  env?: Readonly<Record<string, string | undefined>> | undefined;
  /**
   * Told about every sign-in, refresh or setting that failed. Default: one `console.error`
   * line with the code and message, which never hold a token or a claim.
   */
  onError?: ((error: IdpError) => void) | undefined;
};

/** What checking access tokens needs: an API has no sign-in of its own. */
export type ApiConfig = {
  issuer: string;
  audience: string;
  /** For introspecting opaque tokens; a JWT needs neither. */
  clientId: string | undefined;
  clientSecret: string | undefined;
  /** See IdpOptions.acceptOwnTokens. */
  acceptOwnTokens: boolean;
};

/** What a service needs to get tokens of its own: a confidential client. */
export type ServiceConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  /** The API to ask tokens for when a call names none (IDP_RESOURCE). */
  resource: string | undefined;
};

/** The settings once checked, as nextidp uses them. */
export type IdpConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string | undefined;
  /** This app's origin. */
  appUrl: string;
  /** The first one encrypts. */
  secrets: readonly string[];
  scope: string;
  resource: string | undefined;
  basePath: string;
  redirectUri: string;
  afterSignIn: string;
  afterSignOut: string;
  postLogoutRedirectUri: string;
  errorPath: string;
  signOutOfIdp: boolean;
  reauthenticateAfterSignOut: boolean;
  userinfo: boolean;
  sessionMaxAge: number;
  /** https: cookies are Secure, with `__Host-` names (`__Secure-` for `signedOut`). */
  secure: boolean;
  /** `signedOut` is the marker `reauthenticateAfterSignOut` sets, on `basePath` only. */
  cookies: { session: string; flow: string; signedOut: string };
  store: SessionStore | undefined;
  /** Where the auth server sends logout tokens, with a store. */
  backchannelLogoutUri: string;
};

export const DEFAULT_SCOPES = ["openid", "profile", "email", "offline_access"] as const;
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const MIN_SECRET_LENGTH = 32;

type Problems = string[];

/** An option if it was passed, else the environment variable; blanks count as unset. */
function pick(
  option: string | undefined,
  env: IdpOptions["env"],
  variable: string,
): string | undefined {
  const value = option ?? env?.[variable];
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function httpUrl(
  value: string | undefined,
  label: string,
  problems: Problems,
  production: boolean,
): URL | undefined {
  if (value === undefined) {
    problems.push(`${label} is required`);
    return undefined;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${label} must be a URL like https://example.com`);
    return undefined;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    problems.push(`${label} must be an http(s) URL`);
    return undefined;
  }
  if (production && url.protocol !== "https:") {
    problems.push(`${label} must be https in production`);
    return undefined;
  }
  if (url.search || url.hash || url.username || url.password) {
    problems.push(`${label} must have no query, fragment or credentials`);
    return undefined;
  }
  return url;
}

function path(
  value: string | undefined,
  label: string,
  fallback: string,
  problems: Problems,
): string {
  if (value === undefined) return fallback;
  const safe = safePath(value);
  if (!safe) problems.push(`${label} must be a path of this app, like /dashboard`);
  return safe ?? fallback;
}

function secretsFrom(
  option: IdpOptions["secret"],
  env: IdpOptions["env"],
  problems: Problems,
): string[] {
  const list =
    option === undefined
      ? (env?.IDP_SECRET ?? "").split(",")
      : typeof option === "string"
        ? [option]
        : [...option];
  const secrets = list.map((secret) => secret.trim()).filter(Boolean);
  if (secrets.length === 0) problems.push("secret (IDP_SECRET) is required");
  if (secrets.some((secret) => secret.length < MIN_SECRET_LENGTH)) {
    problems.push(`secret (IDP_SECRET) must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return secrets;
}

function scopesFrom(option: IdpOptions["scopes"], env: IdpOptions["env"], problems: Problems) {
  const raw = option ?? env?.IDP_SCOPES;
  const list =
    raw === undefined || (typeof raw === "string" && !raw.trim())
      ? [...DEFAULT_SCOPES]
      : (typeof raw === "string" ? raw.split(/\s+/) : [...raw]).filter(Boolean);
  if (!list.includes("openid")) problems.push("scopes (IDP_SCOPES) must include openid");
  return [...new Set(list)].join(" ");
}

function envOf(options: IdpOptions): IdpOptions["env"] {
  return options.env ?? (typeof process === "undefined" ? undefined : process.env);
}

/**
 * An absolute URI, kept exactly as written: the auth server compares resources and token
 * audiences as strings, so `https://api.example.com` and `https://api.example.com/` differ.
 */
function absoluteUri(value: string | undefined, label: string, problems: Problems) {
  if (value === undefined) return undefined;
  try {
    new URL(value);
    return value;
  } catch {
    problems.push(`${label} must be an absolute URI`);
    return undefined;
  }
}

function misconfigured(problems: Problems): IdpError {
  return new IdpError("misconfigured", `nextidp is misconfigured: ${problems.join("; ")}.`);
}

/**
 * What checking access tokens needs: the issuer and this API's audience. The client ID and
 * secret are optional: only introspection (an opaque token) uses them.
 */
export function resolveApiConfig(options: IdpOptions): ApiConfig {
  const env = envOf(options);
  const problems: Problems = [];
  const issuer = httpUrl(
    pick(options.issuer, env, "IDP_ISSUER"),
    "issuer (IDP_ISSUER)",
    problems,
    env?.NODE_ENV === "production",
  );
  const audience = absoluteUri(
    pick(options.audience, env, "IDP_AUDIENCE"),
    "audience (IDP_AUDIENCE)",
    problems,
  );
  if (!audience && !problems.some((p) => p.startsWith("audience"))) {
    problems.push("audience (IDP_AUDIENCE) is required to check access tokens: this API's URI");
  }
  if (problems.length > 0 || !issuer || !audience) throw misconfigured(problems);
  return {
    issuer: issuer.href.replace(/\/+$/, ""),
    audience,
    clientId: pick(options.clientId, env, "IDP_CLIENT_ID"),
    clientSecret: pick(options.clientSecret, env, "IDP_CLIENT_SECRET"),
    acceptOwnTokens: options.acceptOwnTokens ?? false,
  };
}

/**
 * What getting a service's own tokens (client credentials) needs: the issuer, and a
 * confidential client's ID and secret. Sign-in's `appUrl` and `secret` aren't needed.
 */
export function resolveServiceConfig(options: IdpOptions): ServiceConfig {
  const env = envOf(options);
  const problems: Problems = [];
  const issuer = httpUrl(
    pick(options.issuer, env, "IDP_ISSUER"),
    "issuer (IDP_ISSUER)",
    problems,
    env?.NODE_ENV === "production",
  );
  const clientId = pick(options.clientId, env, "IDP_CLIENT_ID");
  if (!clientId) problems.push("clientId (IDP_CLIENT_ID) is required for service tokens");
  const clientSecret = pick(options.clientSecret, env, "IDP_CLIENT_SECRET");
  if (!clientSecret) {
    problems.push(
      "clientSecret (IDP_CLIENT_SECRET) is required for service tokens: a confidential client",
    );
  }
  const resource = absoluteUri(
    pick(options.resource, env, "IDP_RESOURCE"),
    "resource (IDP_RESOURCE)",
    problems,
  );
  if (problems.length > 0 || !issuer || !clientId || !clientSecret) throw misconfigured(problems);
  return { issuer: issuer.href.replace(/\/+$/, ""), clientId, clientSecret, resource };
}

/**
 * The checked settings for signing people in. Throws an IdpError("misconfigured") that
 * names every setting that's missing or wrong, and never repeats a value.
 */
export function resolveConfig(options: IdpOptions): IdpConfig {
  const env = envOf(options);
  const production = env?.NODE_ENV === "production";
  const problems: Problems = [];

  const issuer = httpUrl(
    pick(options.issuer, env, "IDP_ISSUER"),
    "issuer (IDP_ISSUER)",
    problems,
    production,
  );
  const app = httpUrl(
    pick(options.appUrl, env, "IDP_APP_URL"),
    "appUrl (IDP_APP_URL)",
    problems,
    production,
  );
  if (app && app.pathname !== "/") {
    problems.push("appUrl (IDP_APP_URL) must be an origin, like https://app.example.com");
  }
  const clientId = pick(options.clientId, env, "IDP_CLIENT_ID");
  if (!clientId) problems.push("clientId (IDP_CLIENT_ID) is required");
  const clientSecret = pick(options.clientSecret, env, "IDP_CLIENT_SECRET");
  const secrets = secretsFrom(options.secret, env, problems);
  const scope = scopesFrom(options.scopes, env, problems);

  const resource = absoluteUri(
    pick(options.resource, env, "IDP_RESOURCE"),
    "resource (IDP_RESOURCE)",
    problems,
  );

  const basePath = options.basePath ?? "/auth";
  if (!/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
    problems.push("basePath must be a path like /auth, without a trailing slash");
  }
  const afterSignIn = path(options.afterSignIn, "afterSignIn", "/", problems);
  const afterSignOut = path(options.afterSignOut, "afterSignOut", "/", problems);
  const errorPath = path(options.errorPath, "errorPath", "/", problems);

  const sessionMaxAge = options.sessionMaxAge ?? SEVEN_DAYS;
  if (!Number.isInteger(sessionMaxAge) || sessionMaxAge < 60) {
    problems.push("sessionMaxAge must be a whole number of seconds, at least 60");
  }
  const prefix = options.cookiePrefix ?? "nextidp";
  if (!/^[A-Za-z0-9._-]{1,32}$/.test(prefix)) {
    problems.push("cookiePrefix may hold letters, digits, dots, dashes and underscores only");
  }

  const store = options.store;
  if (
    store !== undefined &&
    (typeof store?.get !== "function" ||
      typeof store.set !== "function" ||
      typeof store.delete !== "function")
  ) {
    problems.push("store must have get, set and delete functions");
  }

  if (problems.length > 0 || !issuer || !app || !clientId) throw misconfigured(problems);

  const appUrl = app.origin;
  const secure = app.protocol === "https:";
  // __Host-: Secure, Path=/ and no Domain, so no other subdomain can set or read them.
  const name = (purpose: string) => `${secure ? "__Host-" : ""}${prefix}.${purpose}`;
  return {
    // Kept exactly as written, without a trailing slash: it's compared with the discovery
    // document's issuer and every token's `iss`.
    issuer: issuer.href.replace(/\/+$/, ""),
    clientId,
    clientSecret,
    appUrl,
    secrets,
    scope,
    resource,
    basePath,
    redirectUri: `${appUrl}${basePath}/callback`,
    afterSignIn,
    afterSignOut,
    postLogoutRedirectUri: `${appUrl}${afterSignOut}`,
    errorPath,
    signOutOfIdp: options.signOutOfIdp ?? false,
    reauthenticateAfterSignOut: options.reauthenticateAfterSignOut ?? false,
    userinfo: options.userinfo ?? false,
    sessionMaxAge,
    secure,
    cookies: {
      session: name("session"),
      flow: name("flow"),
      // Path=<basePath>, which a __Host- name doesn't allow: __Secure- keeps it https-only.
      signedOut: `${secure ? "__Secure-" : ""}${prefix}.signed-out`,
    },
    store,
    backchannelLogoutUri: `${appUrl}${basePath}/backchannel-logout`,
  };
}
