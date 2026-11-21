import { describe, expect, it } from "vitest";
import { authorizeUrlFrom, signedOidcQuery } from "./oidc-query";

const signed =
  "response_type=code&client_id=abc&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb" +
  "&scope=openid+email&state=s1&nonce=n1&code_challenge=ch&code_challenge_method=S256" +
  "&exp=1795273298&ba_iat=1&ba_param=client_id&ba_param=scope&sig=abc%3D";

describe("signedOidcQuery", () => {
  it("passes a signed authorization query on unchanged", () => {
    expect(signedOidcQuery(signed)).toBe(new URLSearchParams(signed).toString());
    expect(signedOidcQuery(`?${signed}`)).toBe(new URLSearchParams(signed).toString());
  });

  it("is empty without a signature or a client", () => {
    expect(signedOidcQuery("client_id=abc&response_type=code")).toBe("");
    expect(signedOidcQuery("sig=x")).toBe("");
    expect(signedOidcQuery({})).toBe("");
  });

  it("reads Next's searchParams objects, repeated keys included", () => {
    const query = signedOidcQuery({ client_id: "abc", sig: "x", ba_param: ["a", "b"] });
    expect(new URLSearchParams(query).getAll("ba_param")).toEqual(["a", "b"]);
  });
});

describe("authorizeUrlFrom", () => {
  it("rebuilds the authorization request without the signature", () => {
    const url = new URL(authorizeUrlFrom(signed) ?? "", "https://auth.example.com");
    expect(url.pathname).toBe("/api/auth/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "abc",
      redirect_uri: "https://app.example.com/cb",
      scope: "openid email",
      state: "s1",
      nonce: "n1",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
  });

  it("drops anything that isn't an authorization parameter", () => {
    const url = authorizeUrlFrom("response_type=code&client_id=a&returnTo=//evil&error=x") ?? "";
    expect(url).not.toContain("returnTo");
    expect(url).not.toContain("error");
  });

  it("is undefined when there's no authorization request", () => {
    expect(authorizeUrlFrom("")).toBeUndefined();
    expect(authorizeUrlFrom({ client_id: "a" })).toBeUndefined();
  });

  it("for a fresh sign-in, drops prompt=login and max_age but keeps other prompts", () => {
    const query = "response_type=code&client_id=a&prompt=login+consent&max_age=0";
    const url = new URL(authorizeUrlFrom(query, { freshSignIn: true }) ?? "", "https://x.example");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.has("max_age")).toBe(false);

    const onlyLogin = authorizeUrlFrom("response_type=code&client_id=a&prompt=login", {
      freshSignIn: true,
    });
    expect(onlyLogin).not.toContain("prompt");
    // Without the option, the app's demand stands (a restart must still ask to log in).
    expect(authorizeUrlFrom(query)).toContain("prompt=login");
  });
});
