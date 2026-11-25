import { describe, expect, it } from "vitest";
import { authServerOrigin, buildContentSecurityPolicy } from "./csp";

function formAction(csp: string): string | undefined {
  return csp.split("; ").find((directive) => directive.startsWith("form-action"));
}

describe("the example app's Content-Security-Policy", () => {
  it("lets forms go to this app and, by redirect, to the auth server, nowhere else", () => {
    const authServer = authServerOrigin({
      EXAMPLE_AUTH_SERVER_URL: "http://auth.localtest.me:3000",
    });
    expect(authServer).toBe("http://auth.localtest.me:3000");
    expect(formAction(buildContentSecurityPolicy({ nonce: "n", isDev: false, authServer }))).toBe(
      "form-action 'self' http://auth.localtest.me:3000",
    );
    expect(formAction(buildContentSecurityPolicy({ nonce: "n", isDev: false }))).toBe(
      "form-action 'self'",
    );
  });

  it("takes only an http(s) origin from the setting", () => {
    expect(authServerOrigin({ EXAMPLE_AUTH_SERVER_URL: "https://id.example.com/path" })).toBe(
      "https://id.example.com",
    );
    expect(authServerOrigin({ EXAMPLE_AUTH_SERVER_URL: "javascript:alert(1)" })).toBeUndefined();
    expect(authServerOrigin({})).toBeUndefined();
  });
});
