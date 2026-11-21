import * as v from "valibot";

// The example client's configuration, read on the server only. Errors name the variable and
// never repeat its value.

/** An origin with nothing after it: http(s)://host[:port]. */
const OriginSchema = v.pipe(
  v.string(),
  v.trim(),
  v.url(),
  v.check((value) => {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.pathname === "/";
  }, "must be an origin like https://auth.example.com"),
  v.transform((value) => new URL(value).origin),
);

const RawEnvSchema = v.object({
  NODE_ENV: v.optional(v.picklist(["development", "production", "test"]), "development"),
  /** The auth server: the OIDC issuer. */
  EXAMPLE_AUTH_SERVER_URL: OriginSchema,
  /** This app's own origin; the redirect URI is <origin>/oidc/callback. */
  EXAMPLE_APP_URL: OriginSchema,
  EXAMPLE_CLIENT_ID: v.pipe(v.string(), v.trim(), v.nonEmpty()),
  /** Set for a confidential client (client_secret_basic); empty for a public one. */
  EXAMPLE_CLIENT_SECRET: v.optional(v.pipe(v.string(), v.trim()), ""),
  /** Encrypts this app's own cookies. At least 32 characters. */
  EXAMPLE_SESSION_SECRET: v.pipe(v.string(), v.minLength(32, "must be at least 32 characters")),
  /** The auth server's cookie prefix: only those cookies are forwarded to it. */
  EXAMPLE_AUTH_COOKIE_PREFIX: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty()), "nvx-auth"),
});

export type ExampleEnv = {
  isProduction: boolean;
  authServerUrl: string;
  appUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string | undefined;
  sessionSecret: string;
  authCookiePrefix: string;
};

export function parseEnv(source: Record<string, string | undefined>): ExampleEnv {
  const result = v.safeParse(RawEnvSchema, source);
  if (!result.success) {
    const problems = result.issues.map((issue) => {
      const key = issue.path?.[0]?.key;
      return `${typeof key === "string" ? key : "environment"}: ${issue.message}`;
    });
    throw new Error(`Invalid environment for example-client. ${problems.join("; ")}`);
  }
  const env = result.output;
  if (env.NODE_ENV === "production") {
    for (const [name, value] of [
      ["EXAMPLE_AUTH_SERVER_URL", env.EXAMPLE_AUTH_SERVER_URL],
      ["EXAMPLE_APP_URL", env.EXAMPLE_APP_URL],
    ] as const) {
      if (!value.startsWith("https://")) {
        throw new Error(`Invalid environment for example-client. ${name}: must be https`);
      }
    }
  }
  return {
    isProduction: env.NODE_ENV === "production",
    authServerUrl: env.EXAMPLE_AUTH_SERVER_URL,
    appUrl: env.EXAMPLE_APP_URL,
    redirectUri: `${env.EXAMPLE_APP_URL}/oidc/callback`,
    clientId: env.EXAMPLE_CLIENT_ID,
    clientSecret: env.EXAMPLE_CLIENT_SECRET === "" ? undefined : env.EXAMPLE_CLIENT_SECRET,
    sessionSecret: env.EXAMPLE_SESSION_SECRET,
    authCookiePrefix: env.EXAMPLE_AUTH_COOKIE_PREFIX,
  };
}
