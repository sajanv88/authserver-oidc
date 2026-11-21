import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

const origin = "http://auth.localtest.me:3000";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`${origin}${path}`, cookie ? { headers: { cookie } } : {});
}

describe("proxy", () => {
  it.each([
    ["/account/security", "/account/security"],
    ["/admin/clients?page=2", "/admin/clients?page=2"],
    ["/account", "/account"],
  ])("sends %s without a session cookie to the login page, coming back after", (path, back) => {
    const response = proxy(request(path));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe(back);
  });

  it.each(["nvx-auth.session_token=abc", "__Secure-nvx-auth.session_token=abc"])(
    "lets a request with a session cookie through (%s)",
    (cookie) => {
      expect(proxy(request("/account/security", cookie)).headers.get("location")).toBeNull();
    },
  );

  it("ignores another app's cookie on the same domain", () => {
    const response = proxy(request("/account/security", "better-auth.session_token=abc"));
    expect(response.status).toBe(307);
  });

  it.each(["/login", "/consent", "/accounting", "/administrator"])("doesn't gate %s", (path) => {
    expect(proxy(request(path)).headers.get("location")).toBeNull();
  });

  it("sends a CSP whose nonce is the one handed to the page, and the path for layouts", () => {
    const response = proxy(request("/login?client_id=x"));
    const csp = response.headers.get("content-security-policy") ?? "";
    const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/login?client_id=x");
  });

  it("overwrites an x-pathname sent by the client", () => {
    const forged = new NextRequest(`${origin}/login`, {
      headers: { "x-pathname": "//evil.example" },
    });
    expect(proxy(forged).headers.get("x-middleware-request-x-pathname")).toBe("/login");
  });

  it("uses a new nonce for every response", () => {
    const a = proxy(request("/login")).headers.get("content-security-policy");
    const b = proxy(request("/login")).headers.get("content-security-policy");
    expect(a).not.toBe(b);
  });
});
