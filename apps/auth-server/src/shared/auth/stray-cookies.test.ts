import { describe, expect, it } from "vitest";
import { strayAuthCookieDeletions } from "./stray-cookies";

const hostname = "auth.localtest.me";
const twice = "nvx-auth.session_token=stale.sig; theme=dark; nvx-auth.session_token=fresh.sig";

describe("strayAuthCookieDeletions", () => {
  it("leaves a browser alone that sends each of our cookies once", () => {
    for (const cookieHeader of [
      null,
      "",
      "nvx-auth.session_token=a.b; nvx-auth.dont_remember=c",
      // Another app's cookies, twice, aren't ours to clear.
      "better-auth.session_token=a; better-auth.session_token=b; theme=x; theme=y",
    ]) {
      expect(
        strayAuthCookieDeletions({
          cookieHeader,
          method: "GET",
          hostname,
          cookieDomain: undefined,
        }),
      ).toEqual([]);
    }
  });

  it("without COOKIE_DOMAIN, expires the parent domains' copies and never the host's", () => {
    expect(
      strayAuthCookieDeletions({
        cookieHeader: twice,
        method: "GET",
        hostname,
        cookieDomain: undefined,
      }),
    ).toEqual([
      "nvx-auth.session_token=; Path=/; Domain=localtest.me; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
    expect(
      strayAuthCookieDeletions({
        cookieHeader: twice,
        method: "GET",
        hostname: "login.eu.example.com",
        cookieDomain: undefined,
      }).map((c) => c.match(/Domain=([^;]+)/)?.[1]),
    ).toEqual(["eu.example.com", "example.com"]);
  });

  it("with COOKIE_DOMAIN, expires the host's copy and the other parents', never its own", () => {
    const deletions = strayAuthCookieDeletions({
      cookieHeader: twice,
      method: "GET",
      hostname: "login.eu.example.com",
      cookieDomain: ".eu.example.com",
    });
    expect(deletions.map((c) => c.match(/Domain=([^;]+)/)?.[1] ?? "host")).toEqual([
      "host",
      "example.com",
    ]);
  });

  it("expires every name sent twice, a __Secure- one as Secure", () => {
    const deletions = strayAuthCookieDeletions({
      cookieHeader:
        "__Secure-nvx-auth.session_token=a; __Secure-nvx-auth.session_token=b; " +
        "nvx-auth.dont_remember=c; nvx-auth.dont_remember=d; nvx-auth.session_data=e",
      method: "GET",
      hostname,
      cookieDomain: undefined,
    });
    expect(deletions).toEqual([
      "__Secure-nvx-auth.session_token=; Path=/; Domain=localtest.me; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
      "nvx-auth.dont_remember=; Path=/; Domain=localtest.me; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
  });

  it("on a form post, expires the other scopes' copy of a cookie sent once: the post's is ours", () => {
    const once = "nvx-auth.session_token=from-another-scope.sig; theme=dark";
    expect(
      strayAuthCookieDeletions({
        cookieHeader: once,
        method: "POST",
        hostname,
        cookieDomain: undefined,
      }),
    ).toEqual([
      "nvx-auth.session_token=; Path=/; Domain=localtest.me; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
    expect(
      strayAuthCookieDeletions({
        cookieHeader: "theme=dark",
        method: "POST",
        hostname,
        cookieDomain: undefined,
      }),
    ).toEqual([]);
  });

  it("has nothing to expire on a host without parents, when COOKIE_DOMAIN is unset", () => {
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      expect(
        strayAuthCookieDeletions({
          cookieHeader: twice,
          method: "POST",
          hostname: host,
          cookieDomain: undefined,
        }),
      ).toEqual([]);
    }
  });
});
