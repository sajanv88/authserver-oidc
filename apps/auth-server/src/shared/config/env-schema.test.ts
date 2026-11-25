import { describe, expect, it } from "vitest";
import { parseEnv } from "./env-schema";

const secret = "q3J8v1Zx9LmT0pR7sW2yN5cB4dF6gH8k";

const valid = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://app:app@127.0.0.1:5432/auth_server",
  BETTER_AUTH_SECRET: secret,
  BETTER_AUTH_URL: "http://auth.localtest.me:3000",
  COOKIE_DOMAIN: ".localtest.me",
  TRUSTED_ORIGINS: "http://app.localtest.me:3001, http://other.localtest.me:3002",
  EMAIL_PROVIDER: "console",
  EMAIL_FROM: "Auth <no-reply@localtest.me>",
};

const production = {
  ...valid,
  NODE_ENV: "production",
  BETTER_AUTH_URL: "https://auth.example.com",
  COOKIE_DOMAIN: ".example.com",
  TRUSTED_ORIGINS: "https://app.example.com",
  TRUSTED_PROXIES: "10.0.0.0/8, 192.168.1.10, fd00::/8",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "465",
  SMTP_USER: "user",
  SMTP_PASSWORD: "app-password",
};

function errorsFor(source: Record<string, string | undefined>): string[] {
  const result = parseEnv(source);
  return result.ok ? [] : result.errors;
}

describe("parseEnv", () => {
  it("parses a local development environment", () => {
    const result = parseEnv(valid);
    expect(result).toEqual({
      ok: true,
      env: expect.objectContaining({
        isProduction: false,
        betterAuthUrl: "http://auth.localtest.me:3000",
        cookieDomain: ".localtest.me",
        trustedOrigins: ["http://app.localtest.me:3001", "http://other.localtest.me:3002"],
        trustedProxies: [],
        email: { provider: "console", from: "Auth <no-reply@localtest.me>" },
      }),
    });
  });

  it("parses a production environment with SMTP", () => {
    const result = parseEnv(production);
    if (!result.ok) throw new Error(result.errors.join("; "));
    expect(result.env.trustedProxies).toEqual(["10.0.0.0/8", "192.168.1.10", "fd00::/8"]);
    expect(result.env.email).toEqual({
      provider: "smtp",
      from: "Auth <no-reply@localtest.me>",
      host: "smtp.example.com",
      port: 465,
      user: "user",
      password: "app-password",
    });
  });

  it("turns cross-subdomain cookies off when COOKIE_DOMAIN is empty", () => {
    const result = parseEnv({ ...valid, COOKIE_DOMAIN: "" });
    expect(result.ok && result.env.cookieDomain).toBeUndefined();
  });

  it.each([
    ["short", "too-short", "at least 32"],
    ["Better Auth's default", "better-auth-secret-12345678901234567890", "published default"],
    ["a repeated pattern", "a".repeat(40), "random"],
  ])("rejects a %s secret", (_, value, message) => {
    expect(errorsFor({ ...valid, BETTER_AUTH_SECRET: value }).join()).toContain(message);
  });

  it.each([
    "https://*.example.com",
    "https://app.example.com/path",
    "app.example.com",
    "ftp://app.example.com",
  ])("rejects %s as a trusted origin", (origin) => {
    expect(errorsFor({ ...valid, TRUSTED_ORIGINS: origin }).join()).toContain("TRUSTED_ORIGINS");
  });

  it("rejects a cookie domain that isn't a parent of the auth server's host", () => {
    expect(errorsFor({ ...valid, COOKIE_DOMAIN: ".example.com" }).join()).toContain(
      "COOKIE_DOMAIN must be a parent domain",
    );
  });

  it.each(["10.0.0.0/33", "not-an-ip", "10.0.0.0/8/1"])(
    "rejects %s as a trusted proxy",
    (proxy) => {
      expect(errorsFor({ ...valid, TRUSTED_PROXIES: proxy }).join()).toContain("TRUSTED_PROXIES");
    },
  );

  it("requires the SMTP settings when the provider is smtp", () => {
    const errors = errorsFor({ ...valid, EMAIL_PROVIDER: "smtp" });
    expect(errors).toEqual(
      expect.arrayContaining([
        "SMTP_HOST is required when EMAIL_PROVIDER is smtp",
        "SMTP_USER is required when EMAIL_PROVIDER is smtp",
        "SMTP_PASSWORD is required when EMAIL_PROVIDER is smtp",
      ]),
    );
  });

  it("refuses console email, http URLs and http origins in production", () => {
    const errors = errorsFor({
      ...production,
      EMAIL_PROVIDER: "console",
      BETTER_AUTH_URL: "http://auth.example.com",
      TRUSTED_ORIGINS: "http://app.example.com",
    }).join();
    expect(errors).toContain("EMAIL_PROVIDER must be smtp in production");
    expect(errors).toContain("BETTER_AUTH_URL must be https in production");
    expect(errors).toContain("TRUSTED_ORIGINS must all be https in production");
  });

  it("never puts a value in an error message", () => {
    const errors = errorsFor({ ...valid, BETTER_AUTH_SECRET: "leaky-secret-value" }).join();
    expect(errors).not.toContain("leaky-secret-value");
  });

  it("leaves Turnstile off unless both keys are set, and refuses half of them", () => {
    const off = parseEnv({ ...valid, TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: " " });
    expect(off.ok && off.env.turnstile).toBeUndefined();

    const on = parseEnv({ ...valid, TURNSTILE_SITE_KEY: " site ", TURNSTILE_SECRET_KEY: "secret" });
    expect(on.ok && on.env.turnstile).toEqual({ siteKey: "site", secretKey: "secret" });

    expect(errorsFor({ ...valid, TURNSTILE_SITE_KEY: "site" })).toEqual([
      "TURNSTILE_SECRET_KEY is required when TURNSTILE_SITE_KEY is set",
    ]);
    expect(errorsFor({ ...valid, TURNSTILE_SECRET_KEY: "secret" })).toEqual([
      "TURNSTILE_SITE_KEY is required when TURNSTILE_SECRET_KEY is set",
    ]);
  });

  it("turns each sign-in provider on with its client ID and secret, and leaves the rest off", () => {
    const none = parseEnv(valid);
    expect(none.ok && none.env.social).toEqual({});

    const some = parseEnv({
      ...valid,
      GOOGLE_CLIENT_ID: "google-id",
      GOOGLE_CLIENT_SECRET: "google-secret",
      GITHUB_CLIENT_ID: " ",
      MICROSOFT_CLIENT_ID: "microsoft-id",
      MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    });
    expect(some.ok && some.env.social).toEqual({
      google: { clientId: "google-id", clientSecret: "google-secret" },
      microsoft: {
        clientId: "microsoft-id",
        clientSecret: "microsoft-secret",
        tenantId: "common",
      },
    });
  });

  it("refuses half a provider", () => {
    expect(errorsFor({ ...valid, GITHUB_CLIENT_ID: "id" })).toEqual([
      "GITHUB_CLIENT_SECRET is required when GITHUB_CLIENT_ID is set",
    ]);
    expect(errorsFor({ ...valid, MICROSOFT_CLIENT_SECRET: "secret" })).toEqual([
      "MICROSOFT_CLIENT_ID is required when MICROSOFT_CLIENT_SECRET is set",
    ]);
  });

  it("needs every SSO setting for the OIDC provider, and https discovery in production", () => {
    const sso = {
      SSO_NAME: "Okta",
      SSO_DISCOVERY_URL: "https://example.okta.com/.well-known/openid-configuration",
      SSO_CLIENT_ID: "sso-id",
      SSO_CLIENT_SECRET: "sso-secret",
    };
    const on = parseEnv({ ...valid, ...sso, MICROSOFT_TENANT_ID: "contoso.onmicrosoft.com" });
    expect(on.ok && on.env.social.sso).toEqual({
      name: "Okta",
      discoveryUrl: sso.SSO_DISCOVERY_URL,
      clientId: "sso-id",
      clientSecret: "sso-secret",
    });
    expect(errorsFor({ ...valid, SSO_CLIENT_ID: "sso-id" })).toEqual([
      "SSO_NAME is required when any SSO_* setting is set",
      "SSO_DISCOVERY_URL is required when any SSO_* setting is set",
      "SSO_CLIENT_SECRET is required when any SSO_* setting is set",
    ]);
    expect(
      errorsFor({ ...production, ...sso, SSO_DISCOVERY_URL: "http://sso.internal/.well-known" }),
    ).toEqual(["SSO_DISCOVERY_URL must be https in production"]);
    expect(errorsFor({ ...valid, MICROSOFT_TENANT_ID: "not a tenant" })).toEqual([
      "MICROSOFT_TENANT_ID must be a tenant ID or name",
    ]);
  });

  it("offers no APIs unless OAUTH_RESOURCES and OAUTH_API_SCOPES name some", () => {
    const off = parseEnv(valid);
    expect(off.ok && off.env.oauth).toEqual({ resources: [], apiScopes: [] });

    const on = parseEnv({
      ...valid,
      OAUTH_RESOURCES: "https://api.example.com, http://api.localtest.me:4000/v1",
      OAUTH_API_SCOPES: "crm, booking invoicing:read",
    });
    expect(on.ok && on.env.oauth).toEqual({
      resources: ["https://api.example.com", "http://api.localtest.me:4000/v1"],
      apiScopes: ["crm", "booking", "invoicing:read"],
    });
  });

  it("refuses resources that aren't plain absolute URIs, and http ones in production", () => {
    for (const resource of ["api.example.com", "https://api.example.com/#x", "https://a/?q=1"]) {
      expect(errorsFor({ ...valid, OAUTH_RESOURCES: resource })).toEqual([
        "OAUTH_RESOURCES.0 must be absolute URIs such as https://api.example.com, without ? or #",
      ]);
    }
    expect(errorsFor({ ...production, OAUTH_RESOURCES: "http://api.internal" })).toEqual([
      "OAUTH_RESOURCES must all be https in production",
    ]);
    expect(
      errorsFor({ ...valid, OAUTH_RESOURCES: "https://api.example.com,https://api.example.com" }),
    ).toEqual(["OAUTH_RESOURCES must not list a resource twice"]);
  });

  it("refuses API scopes that aren't lowercase names, repeat, or reuse an OpenID Connect one", () => {
    expect(errorsFor({ ...valid, OAUTH_API_SCOPES: "CRM" })).toEqual([
      "OAUTH_API_SCOPES.0 must be lowercase scope names such as crm or crm:read",
    ]);
    expect(errorsFor({ ...valid, OAUTH_API_SCOPES: "crm email" })).toEqual([
      "OAUTH_API_SCOPES.1 must not repeat an OpenID Connect scope",
    ]);
    expect(errorsFor({ ...valid, OAUTH_API_SCOPES: "crm,crm" })).toEqual([
      "OAUTH_API_SCOPES must not list a scope twice",
    ]);
  });

  it("requires two-factor of admins only when TWO_FACTOR_REQUIRED_FOR_ADMINS is true", () => {
    for (const TWO_FACTOR_REQUIRED_FOR_ADMINS of [undefined, "", "false"]) {
      const result = parseEnv({ ...valid, TWO_FACTOR_REQUIRED_FOR_ADMINS });
      expect(result.ok && result.env.twoFactorRequiredForAdmins).toBe(false);
    }
    const on = parseEnv({ ...valid, TWO_FACTOR_REQUIRED_FOR_ADMINS: "true" });
    expect(on.ok && on.env.twoFactorRequiredForAdmins).toBe(true);
    // A typo must not turn a security setting off without a word.
    expect(errorsFor({ ...valid, TWO_FACTOR_REQUIRED_FOR_ADMINS: "yes" })).toEqual([
      'TWO_FACTOR_REQUIRED_FOR_ADMINS must be "true" or "false"',
    ]);
  });

  it("calls the product Auth Server unless APP_NAME names it, on one line", () => {
    for (const APP_NAME of [undefined, "", "   "]) {
      const result = parseEnv({ ...valid, APP_NAME });
      expect(result.ok && result.env.appName).toBe("Auth Server");
    }
    const named = parseEnv({ ...valid, APP_NAME: "  Acme ID  " });
    expect(named.ok && named.env.appName).toBe("Acme ID");

    // It goes into email subjects: a line break could add a header.
    expect(errorsFor({ ...valid, APP_NAME: "Acme\r\nBcc: someone@example.com" })).toEqual([
      "APP_NAME must be one line, without control characters",
    ]);
    expect(errorsFor({ ...valid, APP_NAME: "x".repeat(51) })).toEqual([
      "APP_NAME must be at most 50 characters",
    ]);
  });

  it("shows the shield unless LOGO_URL is a full URL, and https in production", () => {
    for (const LOGO_URL of [undefined, "", "  "]) {
      const result = parseEnv({ ...valid, LOGO_URL });
      expect(result.ok && result.env.logoUrl).toBeUndefined();
    }
    const set = parseEnv({ ...valid, LOGO_URL: " https://cdn.example.com/logo.svg " });
    expect(set.ok && set.env.logoUrl).toBe("https://cdn.example.com/logo.svg");

    for (const LOGO_URL of [
      "/logo.svg",
      "javascript:alert(1)",
      "https://user:pw@cdn.example.com/x",
    ]) {
      expect(errorsFor({ ...valid, LOGO_URL })).toEqual([
        "LOGO_URL must be a full http(s) URL, such as https://cdn.example.com/logo.svg",
      ]);
    }
    expect(errorsFor({ ...production, LOGO_URL: "http://cdn.example.com/logo.svg" })).toEqual([
      "LOGO_URL must be https in production",
    ]);
  });
});
