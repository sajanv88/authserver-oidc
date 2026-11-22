import { isIP } from "node:net";
import * as v from "valibot";

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
});

type RawEnv = v.InferOutput<typeof RawEnvSchema>;

export type TurnstileConfig = { siteKey: string; secretKey: string };

export type EmailConfig =
  | { provider: "console"; from: string }
  | { provider: "smtp"; from: string; host: string; port: number; user: string; password: string };

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
};

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
