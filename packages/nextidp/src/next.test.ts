// nextidp/next's routes when Next's client router fetches the login route (a <Link>,
// router.push, a prefetch: the `rsc` header): a plain 200 instead of the redirect, so the
// router loads it as a whole page and no flow cookie is replaced.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_URL,
  CLIENT_ID,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
  SECRET,
} from "../test/fake-issuer.js";

// Outside a Next request there's no connection() to wait for.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

const { idp } = await import("./next.js");

let issuer: FakeIssuer;

beforeEach(async () => {
  issuer = await fakeIssuer();
  vi.stubGlobal("fetch", issuer.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const { GET, POST } = idp({
  issuer: ISSUER,
  clientId: CLIENT_ID,
  appUrl: APP_URL,
  secret: SECRET,
  env: {},
  onError: () => {},
}).routes();

const get = (path: string, headers: Record<string, string> = {}) =>
  GET(new Request(`${APP_URL}${path}`, { headers }));

describe("the login route and Next's client router", () => {
  it.each([{ rsc: "1" }, { rsc: "1", "next-router-prefetch": "1" }])(
    "answers a router fetch (%o) with a plain 200, no cookie, no redirect",
    async (headers) => {
      const response = await get("/auth/login?returnTo=%2Fdashboard", headers);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe("Sign-in needs a full page load.");
      expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.getSetCookie()).toEqual([]);
      // Not a step towards the auth server either.
      expect(issuer.requests).toEqual([]);
    },
  );

  it("still redirects a whole-page load, with the flow cookie", async () => {
    const response = await get("/auth/login");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/^https:\/\/auth\.example\.test\/authorize\?/);
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^__Host-nextidp\.flow=/),
    ]);
  });

  it("handles the router's fetch of any other route as before", async () => {
    const callback = await get("/auth/callback?code=x&state=y", { rsc: "1" });
    expect(callback.status).toBe(303);
    expect(callback.headers.get("location")).toBe(`${APP_URL}/?error=expired`);
    const notFound = await get("/auth/login/more", { rsc: "1" });
    expect(notFound.status).toBe(404);
  });

  it("leaves a POST to the login route alone", async () => {
    const response = await POST(
      new Request(`${APP_URL}/auth/login`, { method: "POST", headers: { rsc: "1" } }),
    );
    expect(response.status).toBe(405);
  });
});
