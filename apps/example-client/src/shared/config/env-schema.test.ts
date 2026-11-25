import { describe, expect, it } from "vitest";
import { parseEnv } from "./env-schema";

const base = {
  EXAMPLE_AUTH_SERVER_URL: "http://auth.localtest.me:3000",
  EXAMPLE_APP_URL: "http://app.localtest.me:3001/",
  EXAMPLE_CLIENT_ID: "client",
  EXAMPLE_SESSION_SECRET: "a test secret that is at least thirty-two characters",
};

describe("example-client environment", () => {
  it("derives the redirect URI and treats an empty secret as a public client", () => {
    expect(parseEnv({ ...base, EXAMPLE_CLIENT_SECRET: "" })).toMatchObject({
      appUrl: "http://app.localtest.me:3001",
      redirectUri: "http://app.localtest.me:3001/oidc/callback",
      postLogoutRedirectUri: "http://app.localtest.me:3001/",
      clientSecret: undefined,
      authCookiePrefix: "nvx-auth",
    });
  });

  it("names what's wrong without repeating the value", () => {
    expect(() => parseEnv({ ...base, EXAMPLE_SESSION_SECRET: "short-secret-value" })).toThrow(
      /EXAMPLE_SESSION_SECRET: must be at least 32 characters/,
    );
    try {
      parseEnv({ ...base, EXAMPLE_SESSION_SECRET: "short-secret-value" });
    } catch (error) {
      expect(String(error)).not.toContain("short-secret-value");
    }
    expect(() => parseEnv({ ...base, EXAMPLE_APP_URL: "http://app.localtest.me:3001/x" })).toThrow(
      /EXAMPLE_APP_URL/,
    );
  });

  it("requires https in production", () => {
    expect(() => parseEnv({ ...base, NODE_ENV: "production" })).toThrow(/must be https/);
  });
});
