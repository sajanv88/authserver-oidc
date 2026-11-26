import { IdpError } from "./errors.js";
import { safePath } from "./return-path.js";

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
  /** How long the session cookie lasts, in seconds, renewed at every refresh. Default 7 days. */
  sessionMaxAge?: number | undefined;
  /** The start of this app's cookie names. Default `nextidp`. */
  cookiePrefix?: string | undefined;
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
  sessionMaxAge: number;
  /** https: cookies are Secure, with `__Host-` names. */
  secure: boolean;
  cookies: { session: string; flow: string };
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

/**
 * The checked settings. Throws an IdpError("misconfigured") that names every setting that's
 * missing or wrong, and never repeats a value.
 */
export function resolveConfig(options: IdpOptions): IdpConfig {
  const env = options.env ?? (typeof process === "undefined" ? undefined : process.env);
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

  const resourceValue = pick(options.resource, env, "IDP_RESOURCE");
  let resource: string | undefined;
  if (resourceValue !== undefined) {
    try {
      resource = new URL(resourceValue).toString();
    } catch {
      problems.push("resource (IDP_RESOURCE) must be an absolute URI");
    }
  }

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

  if (problems.length > 0 || !issuer || !app || !clientId) {
    throw new IdpError("misconfigured", `nextidp is misconfigured: ${problems.join("; ")}.`);
  }

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
    sessionMaxAge,
    secure,
    cookies: { session: name("session"), flow: name("flow") },
  };
}
