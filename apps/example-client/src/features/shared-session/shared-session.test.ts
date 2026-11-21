import { describe, expect, it } from "vitest";
import { authCookieHeader } from "./server/shared-session";

describe("forwarding the shared cookie", () => {
  it("passes on the auth server's cookies only, never this app's", () => {
    expect(
      authCookieHeader(
        "example.session=mine; nvx-auth.session_token=abc; theme=dark; nvx-auth.session_data=xyz",
        "nvx-auth",
      ),
    ).toBe("nvx-auth.session_token=abc; nvx-auth.session_data=xyz");
  });

  it("knows the prefixes production uses", () => {
    expect(authCookieHeader("__Secure-nvx-auth.session_token=abc", "nvx-auth")).toBe(
      "__Secure-nvx-auth.session_token=abc",
    );
  });

  it("doesn't take a lookalike name", () => {
    expect(authCookieHeader("nvx-authx.session_token=abc; nvx-auth=abc", "nvx-auth")).toBe("");
    expect(authCookieHeader(null, "nvx-auth")).toBe("");
  });
});
