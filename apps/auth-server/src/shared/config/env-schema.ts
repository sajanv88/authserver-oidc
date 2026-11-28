import { isIP } from "node:net";
import * as v from "valibot";
import { DEFAULT_APP_NAME } from "./app";

// Runtime configuration, parsed once at the edge (see env.ts). Values come from the chart's
// ConfigMap and the existing Secret in Kubernetes, and from the repo root .env locally.
// NEXT_PUBLIC_* values are build-time constants and don't belong here.

// Better Auth's built-in fallback secret, and the placeholder people paste from docs.
const KNOWN_WEAK_SECRETS = new Set(["better-auth-secret-12345678901234567890", "changeme"]);

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** A trimmed string, or undefined when it's missing or empty. */
const optionalText = v.optional(
  v.pipe(
    v.unknown(),
    v.transform(emptyToUndefined),
    v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
  ),
);

const commaList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** An http(s) origin: scheme, host and optional port. No path, query, credentials or wildcard. */
export const OriginSchema = v.pipe(
  v.string(),
  v.trim(),
  v.check((value) => {
    if (value.includes("*")) return false;
    try {
      const url = new URL(value);
      return (
        (url.protocol === "https:" || url.protocol === "http:") &&
        url.origin === value.replace(/\/$/, "")
      );
    } catch {
      return false;
    }
  }, "must be an origin such as https://app.example.com: no path, no wildcard"),
  v.transform((value) => new URL(value).origin),
);

const ProxySchema = v.pipe(
  v.string(),
  v.check((value) => {
    const [address = "", prefix, ...rest] = value.split("/");
    const family = isIP(address);
    if (family === 0 || rest.length > 0) return false;
    if (prefix === undefined) return true;
    if (!/^\d{1,3}$/.test(prefix)) return false;
    return Number(prefix) <= (family === 4 ? 32 : 128);
  }, "must be an IP address or CIDR range, such as 10.0.0.0/8"),
);

const CookieDomainSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(
    /^\.?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/,
    "must be a domain such as .example.com",
  ),
);

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const UNITS: Record<string, number> = { s: 1, m: MINUTE, h: HOUR, d: DAY };

/** A duration as `90` or `90s` (seconds), `15m`, `8h` or `30d`: its seconds, or undefined. */
export function durationSeconds(value: string): number | undefined {
  const match = /^(\d{1,9})([smhd])?$/.exec(value.trim());
  if (!match) return undefined;
  return Number(match[1]) * (UNITS[match[2] ?? "s"] ?? 1);
}

/** How a bound reads in a message: whole days, hours or minutes where it can. */
function spoken(seconds: number): string {
  for (const [unit, size] of [
    ["day", DAY],
    ["hour", HOUR],
    ["minute", MINUTE],
  ] as const) {
    if (seconds % size === 0) {
      const count = seconds / size;
      return `${count} ${unit}${count === 1 ? "" : "s"}`;
    }
  }
  return `${seconds} seconds`;
}

/** The bounds of each token lifetime, in seconds, and the default. */
export const TOKEN_LIFETIME_BOUNDS = {
  accessToken: { min: MINUTE, max: DAY, fallback: "10m" },
  idToken: { min: MINUTE, max: DAY, fallback: "10m" },
  refreshToken: { min: HOUR, max: 365 * DAY, fallback: "30d" },
} as const;

type Bounds = { min: number; max: number };

const inBounds = (seconds: number | undefined, { min, max }: Bounds) =>
  seconds !== undefined && seconds >= min && seconds <= max;

const boundsMessage = ({ min, max }: Bounds, example: string) =>
  `must be a duration between ${spoken(min)} and ${spoken(max)}, such as ${example}`;

/** A token lifetime setting: a duration within its bounds, or the default when it's empty. */
function lifetime(bounds: Bounds & { fallback: string }) {
  return v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(
        v.pipe(
          v.string(),
          v.check(
            (value) => inBounds(durationSeconds(value), bounds),
            boundsMessage(bounds, bounds.fallback),
          ),
          v.transform((value) => durationSeconds(value) ?? 0),
        ),
        bounds.fallback,
      ),
    ),
    bounds.fallback,
  );
}

/**
 * A protected resource's identifier (RFC 8707 2): an absolute http(s) URI, no fragment, no
 * query, no credentials. Kept exactly as written: it's the `aud` the API checks.
 */
const ResourceSchema = v.pipe(
  v.string(),
  v.check((value) => {
    if (!URL.canParse(value) || value.includes("#") || value.includes("?")) return false;
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === ""
    );
  }, "must be absolute URIs such as https://api.example.com, without ? or #"),
);

/** One API's own lifetimes, shorter than the server's: `access=5m`, `refresh=8h`. */
export type ResourceLifetimes = { accessToken?: number; refreshToken?: number };

export type ResourceConfig = { identifier: string; lifetimes: ResourceLifetimes };

const LIFETIME_OPTION = /^(access|refresh)=(.+)$/;

function resourceLifetimes(options: string[]): ResourceLifetimes | undefined {
  const lifetimes: ResourceLifetimes = {};
  for (const option of options) {
    const match = LIFETIME_OPTION.exec(option);
    const seconds = match?.[2] === undefined ? undefined : durationSeconds(match[2]);
    if (!match || seconds === undefined) return undefined;
    const key = match[1] === "access" ? "accessToken" : "refreshToken";
    if (lifetimes[key] !== undefined) return undefined;
    lifetimes[key] = seconds;
  }
  return lifetimes;
}

const words = (entry: string) => entry.trim().split(/\s+/);

/**
 * An OAUTH_RESOURCES entry: the identifier, then optionally its own lifetimes after a space,
 * `https://api.example.com access=5m refresh=8h`.
 */
const ResourceEntrySchema = v.pipe(
  v.string(),
  v.check(
    (entry) => v.is(ResourceSchema, words(entry)[0]),
    "must be absolute URIs such as https://api.example.com, without ? or #",
  ),
  v.check(
    (entry) => resourceLifetimes(words(entry).slice(1)) !== undefined,
    "takes its lifetimes after a space, once each, as access=5m or refresh=8h",
  ),
  v.check(
    (entry) => {
      const { accessToken, refreshToken } = resourceLifetimes(words(entry).slice(1)) ?? {};
      return (
        (accessToken === undefined || inBounds(accessToken, TOKEN_LIFETIME_BOUNDS.accessToken)) &&
        (refreshToken === undefined || inBounds(refreshToken, TOKEN_LIFETIME_BOUNDS.refreshToken))
      );
    },
    `has an access lifetime between ${spoken(MINUTE)} and ${spoken(DAY)}, and a refresh lifetime between ${spoken(HOUR)} and ${spoken(365 * DAY)}`,
  ),
  v.transform((entry): ResourceConfig => {
    const [identifier = "", ...options] = words(entry);
    return { identifier, lifetimes: resourceLifetimes(options) ?? {} };
  }),
);

/** The OpenID Connect scopes the server always offers; an API scope can't reuse one. */
const OIDC_SCOPE_NAMES = new Set(["openid", "profile", "email", "offline_access"]);

const ApiScopeSchema = v.pipe(
  v.string(),
  v.regex(/^[a-z][a-z0-9_.:-]{0,63}$/, "must be lowercase scope names such as crm or crm:read"),
  v.check((value) => !OIDC_SCOPE_NAMES.has(value), "must not repeat an OpenID Connect scope"),
);

/** Scope names, separated by commas or spaces. */
const scopeList = (value: string) => value.split(/[\s,]+/).filter((item) => item.length > 0);

const RawEnvSchema = v.object({
  NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "production"),
  DATABASE_URL: v.pipe(
    v.string(),
    v.regex(/^postgres(?:ql)?:\/\//, "must be a postgres:// connection URL"),
  ),
  BETTER_AUTH_SECRET: v.pipe(
    v.string(),
    v.minLength(32, "must be at least 32 characters (openssl rand -base64 32)"),
    v.check((value) => !KNOWN_WEAK_SECRETS.has(value), "must not be a published default"),
    v.check((value) => new Set(value).size >= 8, "must be random, not a repeated pattern"),
  ),
  BETTER_AUTH_URL: OriginSchema,
  COOKIE_DOMAIN: v.optional(
    v.pipe(v.unknown(), v.transform(emptyToUndefined), v.optional(CookieDomainSchema)),
  ),
  TRUSTED_ORIGINS: v.optional(
    v.pipe(v.string(), v.transform(commaList), v.array(OriginSchema)),
    "",
  ),
  TRUSTED_PROXIES: v.optional(v.pipe(v.string(), v.transform(commaList), v.array(ProxySchema)), ""),
  EMAIL_PROVIDER: v.optional(v.picklist(["console", "smtp"]), "console"),
  EMAIL_FROM: v.pipe(
    v.string(),
    v.trim(),
    v.regex(
      /@[^@\s>]+\.[^@\s>]+>?$/,
      "must be an address, optionally with a name: Auth <no-reply@example.com>",
    ),
  ),
  SMTP_HOST: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    ),
  ),
  SMTP_PORT: v.optional(
    v.pipe(
      v.string(),
      v.transform(Number),
      v.integer("must be a port number"),
      v.minValue(1),
      v.maxValue(65535),
    ),
    "587",
  ),
  SMTP_USER: v.optional(v.pipe(v.unknown(), v.transform(emptyToUndefined), v.optional(v.string()))),
  SMTP_PASSWORD: v.optional(
    v.pipe(v.unknown(), v.transform(emptyToUndefined), v.optional(v.string())),
  ),
  // Cloudflare Turnstile on the forms and the auth endpoints behind them. Off unless both are
  // set: the site key is public (the ConfigMap), the secret key is a secret (the Secret).
  TURNSTILE_SITE_KEY: optionalText,
  TURNSTILE_SECRET_KEY: optionalText,
  // Sign-in with another account. Each provider is on when its client ID (the ConfigMap) and
  // secret (the Secret) are both set, and off when neither is.
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  GITHUB_CLIENT_ID: optionalText,
  GITHUB_CLIENT_SECRET: optionalText,
  MICROSOFT_CLIENT_ID: optionalText,
  MICROSOFT_CLIENT_SECRET: optionalText,
  // "common" (work and personal accounts), "organizations", "consumers", or one tenant's ID.
  MICROSOFT_TENANT_ID: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(
        v.pipe(v.string(), v.trim(), v.regex(/^[A-Za-z0-9.-]+$/, "must be a tenant ID or name")),
      ),
    ),
  ),
  // Any OpenID Connect provider (Okta, Keycloak, Auth0, Entra ID…), found from its discovery
  // document. SSO_NAME is what the button says: "Continue with <SSO_NAME>".
  SSO_NAME: optionalText,
  SSO_DISCOVERY_URL: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(v.pipe(v.string(), v.trim(), v.url("must be a URL"))),
    ),
  ),
  SSO_CLIENT_ID: optionalText,
  SSO_CLIENT_SECRET: optionalText,
  // The APIs this server issues access tokens for (RFC 8707 resource indicators), comma
  // separated. A token asked for with resource=<one of them> is a JWT whose `aud` is that API.
  // An entry can make that API's tokens last less than the server's: `<uri> access=5m
  // refresh=8h`.
  OAUTH_RESOURCES: v.optional(
    v.pipe(v.string(), v.transform(commaList), v.array(ResourceEntrySchema)),
    "",
  ),
  // Scopes for those APIs (crm, booking…), offered beside the OpenID Connect ones.
  OAUTH_API_SCOPES: v.optional(
    v.pipe(v.string(), v.transform(scopeList), v.array(ApiScopeSchema)),
    "",
  ),
  // How long tokens last: a duration such as 90s, 15m, 8h or 30d. Access tokens (a service's
  // too) and ID tokens 1 minute to 24 hours, 10 minutes by default; refresh tokens 1 hour to
  // 365 days, 30 days by default, and longer than access tokens.
  ACCESS_TOKEN_LIFETIME: lifetime(TOKEN_LIFETIME_BOUNDS.accessToken),
  ID_TOKEN_LIFETIME: lifetime(TOKEN_LIFETIME_BOUNDS.idToken),
  REFRESH_TOKEN_LIFETIME: lifetime(TOKEN_LIFETIME_BOUNDS.refreshToken),
  // Every admin must have two-factor on: an admin without it is sent to set it up before
  // anything else, including an app's sign-in. "true" or "false" (the default).
  TWO_FACTOR_REQUIRED_FOR_ADMINS: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(v.picklist(["true", "false"], 'must be "true" or "false"'), "false"),
      v.transform((value) => value === "true"),
    ),
  ),
  // The product's name on the pages, in titles, in emails and in authenticator apps. No line
  // breaks or other control characters: it goes into email subjects.
  APP_NAME: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(
        v.pipe(
          v.string(),
          v.trim(),
          v.maxLength(50, "must be at most 50 characters"),
          v.regex(/^[^\p{Cc}]+$/u, "must be one line, without control characters"),
        ),
      ),
    ),
  ),
  // The logo in place of the shield, on every page: an image anywhere (its origin is
  // added to the CSP's img-src). A square image looks best.
  LOGO_URL: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(emptyToUndefined),
      v.optional(
        v.pipe(
          v.string(),
          v.trim(),
          v.check((value) => {
            if (!URL.canParse(value)) return false;
            const url = new URL(value);
            return (
              (url.protocol === "https:" || url.protocol === "http:") &&
              url.username === "" &&
              url.password === ""
            );
          }, "must be a full http(s) URL, such as https://cdn.example.com/logo.svg"),
        ),
      ),
    ),
  ),
});

type RawEnv = v.InferOutput<typeof RawEnvSchema>;

export type TurnstileConfig = { siteKey: string; secretKey: string };

export type OAuthClientConfig = { clientId: string; clientSecret: string };

/** The sign-in providers that are configured. A missing key is a provider that's off. */
export type SocialConfig = {
  google?: OAuthClientConfig;
  github?: OAuthClientConfig;
  microsoft?: OAuthClientConfig & { tenantId: string };
  sso?: OAuthClientConfig & { name: string; discoveryUrl: string };
};

export type EmailConfig =
  | { provider: "console"; from: string }
  | { provider: "smtp"; from: string; host: string; port: number; user: string; password: string };

/** What apps may ask access tokens for, besides signing in. */
export type OAuthApiConfig = {
  /** RFC 8707 resource identifiers: each a possible `aud` of an access token. */
  resources: string[];
  /** The APIs whose tokens last less than the server's, by identifier. */
  resourceLifetimes: Record<string, ResourceLifetimes>;
  /** API scopes, offered beside openid, profile, email and offline_access. */
  apiScopes: string[];
};

export type TokenLifetimes = { accessToken: number; idToken: number; refreshToken: number };

export type ServerEnv = {
  nodeEnv: RawEnv["NODE_ENV"];
  isProduction: boolean;
  databaseUrl: string;
  betterAuthSecret: string;
  /** The auth server's public origin, also the OIDC issuer. */
  betterAuthUrl: string;
  /** Parent domain for the shared session cookie; undefined turns cross-subdomain cookies off. */
  cookieDomain: string | undefined;
  trustedOrigins: string[];
  trustedProxies: string[];
  email: EmailConfig;
  /** Cloudflare Turnstile, or undefined when it isn't configured (no widget, no check). */
  turnstile: TurnstileConfig | undefined;
  social: SocialConfig;
  oauth: OAuthApiConfig;
  /** How long tokens last, in seconds (ACCESS_TOKEN_LIFETIME, ID_TOKEN_LIFETIME, …). */
  tokenLifetimes: TokenLifetimes;
  /** TWO_FACTOR_REQUIRED_FOR_ADMINS: every admin must have two-factor on. */
  twoFactorRequiredForAdmins: boolean;
  /** The product's name: APP_NAME, or "Next-Identity Server". */
  appName: string;
  /** The sign-in pages' logo, or undefined for the default shield. */
  logoUrl: string | undefined;
};

const CLIENT_PAIRS = [
  ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"],
] as const;

const SSO_KEYS = ["SSO_NAME", "SSO_DISCOVERY_URL", "SSO_CLIENT_ID", "SSO_CLIENT_SECRET"] as const;

function client(id: string | undefined, secret: string | undefined) {
  return id && secret ? { clientId: id, clientSecret: secret } : undefined;
}

function socialConfig(env: RawEnv): SocialConfig {
  const google = client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  const github = client(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET);
  const microsoft = client(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET);
  const sso = client(env.SSO_CLIENT_ID, env.SSO_CLIENT_SECRET);
  return {
    ...(google ? { google } : {}),
    ...(github ? { github } : {}),
    ...(microsoft
      ? { microsoft: { ...microsoft, tenantId: env.MICROSOFT_TENANT_ID ?? "common" } }
      : {}),
    ...(sso && env.SSO_NAME && env.SSO_DISCOVERY_URL
      ? { sso: { ...sso, name: env.SSO_NAME, discoveryUrl: env.SSO_DISCOVERY_URL } }
      : {}),
  };
}

// Rules that span fields. Each issue is attached to the field it's about.
const EnvSchema = v.pipe(
  RawEnvSchema,
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const env = dataset.value;
    const production = env.NODE_ENV === "production";
    const issue = (key: keyof RawEnv, message: string) =>
      addIssue({
        message,
        path: [{ type: "object", origin: "value", input: dataset.value, key, value: env[key] }],
      });

    if (env.EMAIL_PROVIDER === "smtp") {
      for (const key of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"] as const) {
        if (!env[key]) issue(key, "is required when EMAIL_PROVIDER is smtp");
      }
    }
    if (production && env.EMAIL_PROVIDER === "console") {
      issue("EMAIL_PROVIDER", "must be smtp in production: console only logs the emails");
    }
    if (production && !env.BETTER_AUTH_URL.startsWith("https://")) {
      issue("BETTER_AUTH_URL", "must be https in production");
    }
    if (production && env.TRUSTED_ORIGINS.some((origin) => !origin.startsWith("https://"))) {
      issue("TRUSTED_ORIGINS", "must all be https in production");
    }
    if (env.COOKIE_DOMAIN) {
      const host = new URL(env.BETTER_AUTH_URL).hostname;
      const domain = env.COOKIE_DOMAIN.replace(/^\./, "");
      if (host !== domain && !host.endsWith(`.${domain}`)) {
        issue("COOKIE_DOMAIN", `must be a parent domain of the auth server's host (${host})`);
      }
    }
    // Half a configuration would show a widget nothing checks, or check tokens no page sends.
    if (env.TURNSTILE_SITE_KEY && !env.TURNSTILE_SECRET_KEY) {
      issue("TURNSTILE_SECRET_KEY", "is required when TURNSTILE_SITE_KEY is set");
    }
    if (env.TURNSTILE_SECRET_KEY && !env.TURNSTILE_SITE_KEY) {
      issue("TURNSTILE_SITE_KEY", "is required when TURNSTILE_SECRET_KEY is set");
    }
    // A client ID without its secret would show a button that can't work.
    for (const [id, secret] of CLIENT_PAIRS) {
      if (env[id] && !env[secret]) issue(secret, `is required when ${id} is set`);
      if (env[secret] && !env[id]) issue(id, `is required when ${secret} is set`);
    }
    if (SSO_KEYS.some((key) => env[key])) {
      for (const key of SSO_KEYS) {
        if (!env[key]) issue(key, "is required when any SSO_* setting is set");
      }
    }
    if (production && env.SSO_DISCOVERY_URL && !env.SSO_DISCOVERY_URL.startsWith("https://")) {
      issue("SSO_DISCOVERY_URL", "must be https in production");
    }
    const identifiers = env.OAUTH_RESOURCES.map((resource) => resource.identifier);
    if (production && identifiers.some((identifier) => !identifier.startsWith("https://"))) {
      issue("OAUTH_RESOURCES", "must all be https in production");
    }
    if (new Set(identifiers).size !== identifiers.length) {
      issue("OAUTH_RESOURCES", "must not list a resource twice");
    }
    if (env.REFRESH_TOKEN_LIFETIME <= env.ACCESS_TOKEN_LIFETIME) {
      issue("REFRESH_TOKEN_LIFETIME", "must be longer than ACCESS_TOKEN_LIFETIME");
    }
    // The OAuth plugin only ever shortens a token for an API; a longer one would be ignored.
    for (const { lifetimes } of env.OAUTH_RESOURCES) {
      if ((lifetimes.accessToken ?? 0) > env.ACCESS_TOKEN_LIFETIME) {
        issue("OAUTH_RESOURCES", "access lifetimes must not be longer than ACCESS_TOKEN_LIFETIME");
      }
      if ((lifetimes.refreshToken ?? 0) > env.REFRESH_TOKEN_LIFETIME) {
        issue(
          "OAUTH_RESOURCES",
          "refresh lifetimes must not be longer than REFRESH_TOKEN_LIFETIME",
        );
      }
    }
    if (new Set(env.OAUTH_API_SCOPES).size !== env.OAUTH_API_SCOPES.length) {
      issue("OAUTH_API_SCOPES", "must not list a scope twice");
    }
    if (production && env.LOGO_URL && !env.LOGO_URL.startsWith("https://")) {
      issue("LOGO_URL", "must be https in production");
    }
  }),
  v.transform(
    (env): ServerEnv => ({
      nodeEnv: env.NODE_ENV,
      isProduction: env.NODE_ENV === "production",
      databaseUrl: env.DATABASE_URL,
      betterAuthSecret: env.BETTER_AUTH_SECRET,
      betterAuthUrl: env.BETTER_AUTH_URL,
      cookieDomain: env.COOKIE_DOMAIN,
      trustedOrigins: env.TRUSTED_ORIGINS,
      trustedProxies: env.TRUSTED_PROXIES,
      email:
        env.EMAIL_PROVIDER === "smtp"
          ? {
              provider: "smtp",
              from: env.EMAIL_FROM,
              host: env.SMTP_HOST ?? "",
              port: env.SMTP_PORT,
              user: env.SMTP_USER ?? "",
              password: env.SMTP_PASSWORD ?? "",
            }
          : { provider: "console", from: env.EMAIL_FROM },
      turnstile:
        env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY
          ? { siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY }
          : undefined,
      social: socialConfig(env),
      oauth: {
        resources: env.OAUTH_RESOURCES.map((resource) => resource.identifier),
        resourceLifetimes: Object.fromEntries(
          env.OAUTH_RESOURCES.filter(
            ({ lifetimes }) =>
              lifetimes.accessToken !== undefined || lifetimes.refreshToken !== undefined,
          ).map(({ identifier, lifetimes }) => [identifier, lifetimes]),
        ),
        apiScopes: env.OAUTH_API_SCOPES,
      },
      tokenLifetimes: {
        accessToken: env.ACCESS_TOKEN_LIFETIME,
        idToken: env.ID_TOKEN_LIFETIME,
        refreshToken: env.REFRESH_TOKEN_LIFETIME,
      },
      twoFactorRequiredForAdmins: env.TWO_FACTOR_REQUIRED_FOR_ADMINS ?? false,
      appName: env.APP_NAME ?? DEFAULT_APP_NAME,
      logoUrl: env.LOGO_URL,
    }),
  ),
);

export type EnvResult = { ok: true; env: ServerEnv } | { ok: false; errors: string[] };

/**
 * Parses a set of environment variables. Errors name the variable and the rule, never the
 * value, so a secret never ends up in a log.
 */
export function parseEnv(source: Record<string, string | undefined>): EnvResult {
  const result = v.safeParse(EnvSchema, source);
  if (result.success) return { ok: true, env: result.output };
  const errors = result.issues.map((issue) => {
    const key = issue.path?.map((item) => String(item.key)).join(".") ?? "env";
    return `${key} ${issue.message}`;
  });
  return { ok: false, errors };
}
