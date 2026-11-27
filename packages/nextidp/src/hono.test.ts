// nextidp in a real Hono app, through app.request(), against the fake auth server: sign-in,
// the session on the context, refreshing, signing out, back-channel logout, and API tokens.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_URL,
  APP_URL,
  Browser,
  CLIENT_ID,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
  SECRET,
} from "../test/fake-issuer.js";
import type { IdpOptions } from "./config.js";
import { type IdpEnv, idp } from "./hono.js";
import { memoryStore } from "./store.js";

let issuer: FakeIssuer;
let failures: unknown[];
const realFetch = globalThis.fetch;

// An upstream that sets a cookie of its own: a handler passing its response on (fetch's
// responses can't be changed) must keep that cookie and add the refreshed session's.
let upstream: Server;
let upstreamUrl: string;
beforeAll(async () => {
  upstream = createServer((_req, res) => {
    res.setHeader("set-cookie", "upstream=1; Path=/");
    res.end("from upstream");
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}/`;
});
afterAll(() => {
  upstream.close();
});

beforeEach(async () => {
  issuer = await fakeIssuer();
  vi.stubGlobal("fetch", issuer.fetch);
  failures = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settings: IdpOptions = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  appUrl: APP_URL,
  secret: SECRET,
  audience: API_URL,
  env: {},
  onError: (error) => failures.push(error),
};

function appWith(options: IdpOptions = {}) {
  const auth = idp({ ...settings, ...options });
  const app = new Hono<IdpEnv>();
  app.all("/auth/*", auth.routes());
  app.use(auth.middleware());
  app.get("/", (c) => c.json({ user: c.get("session")?.user.id ?? null }));
  app.get("/dashboard", auth.requireSession(), (c) =>
    c.json({ user: c.get("session")?.user.id, accessToken: c.get("session")?.accessToken }),
  );
  // A handler that makes its own Response: the refreshed cookie must reach it too.
  app.get("/raw", () => new Response("raw"));
  // One whose headers can't be changed.
  app.get("/away", () => Response.redirect(`${APP_URL}/elsewhere`, 302));
  app.get("/proxied", () => realFetch(upstreamUrl));
  app.post("/save", auth.requireSession(), (c) => c.json({ saved: true }));
  app.get("/api/orders", auth.requireToken({ scopes: ["orders:read"] }), (c) =>
    c.json({ subject: c.get("token").subject }),
  );
  return { auth, app };
}

type App = ReturnType<typeof appWith>["app"];

async function visit(app: App, browser: Browser, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (browser.header) headers.set("cookie", browser.header);
  return browser.take(await app.request(`${APP_URL}${path}`, { ...init, headers }));
}

async function signIn(app: App, browser: Browser, returnTo = "/") {
  const login = await visit(app, browser, `/auth/login?${new URLSearchParams({ returnTo })}`);
  const authorize = login.headers.get("location") ?? "";
  const code = issuer.issueCode(authorize);
  const state = new URL(authorize).searchParams.get("state") ?? "";
  return visit(app, browser, `/auth/callback?${new URLSearchParams({ code, state })}`);
}

const form = (fields: Record<string, string>, origin = APP_URL): RequestInit => ({
  method: "POST",
  headers: { origin, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

describe("Hono: signing in", () => {
  it("sends a signed-out visitor of a protected page to sign in, and back to it after", async () => {
    const { app } = appWith();
    const browser = new Browser();
    const away = await visit(app, browser, "/dashboard?tab=2");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe(
      `${APP_URL}/auth/login?${new URLSearchParams({ returnTo: "/dashboard?tab=2" })}`,
    );
    const done = await signIn(app, browser, "/dashboard?tab=2");
    expect(done.headers.get("location")).toBe(`${APP_URL}/dashboard?tab=2`);
    expect(await (await visit(app, browser, "/dashboard")).json()).toMatchObject({
      user: "user-1",
    });
  });

  it("puts the session on every request's context: null signed out", async () => {
    const { app } = appWith();
    const browser = new Browser();
    expect(await (await visit(app, browser, "/")).json()).toEqual({ user: null });
    await signIn(app, browser);
    expect(await (await visit(app, browser, "/")).json()).toEqual({ user: "user-1" });
  });

  it("refreshes an access token about to expire, with the cookie on the response", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const { auth, app } = appWith();
    const browser = new Browser();
    await signIn(app, browser, "/dashboard");
    const before = await auth.getSession(browser.header);
    const page = await visit(app, browser, "/dashboard");
    const { accessToken } = (await page.json()) as { accessToken: string };
    expect(accessToken).not.toBe(before?.accessToken);
    expect((await auth.getSession(browser.header))?.accessToken).toBe(accessToken);
  });

  it("puts the refreshed cookie on a Response the handler made itself", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const { app } = appWith();
    const browser = new Browser();
    await signIn(app, browser);
    const raw = await visit(app, browser, "/raw");
    expect(await raw.text()).toBe("raw");
    expect(raw.headers.getSetCookie().join()).toContain("nextidp.session");

    // Response.redirect's headers can't be changed: the cookie goes out on a copy.
    const other = new Browser();
    await signIn(app, other);
    const away = await visit(app, other, "/away");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe(`${APP_URL}/elsewhere`);
    expect(away.headers.getSetCookie().join()).toContain("nextidp.session");

    const third = new Browser();
    await signIn(app, third);
    const proxied = await visit(app, third, "/proxied");
    expect(await proxied.text()).toBe("from upstream");
    const cookies = proxied.headers.getSetCookie().join();
    expect(cookies).toContain("upstream=1");
    expect(cookies).toContain("nextidp.session");
  });

  it("signs out with the form, and refuses one from another site", async () => {
    const { app } = appWith();
    const browser = new Browser();
    await signIn(app, browser);
    const refused = await visit(app, browser, "/auth/logout", form({}, "https://evil.example"));
    expect(refused.status).toBe(403);
    const out = await visit(app, browser, "/auth/logout", form({ signOutOfIdp: "true" }));
    expect(out.status).toBe(303);
    expect(out.headers.get("location")?.startsWith(`${ISSUER}/end-session?`)).toBe(true);
    expect(await (await visit(app, browser, "/")).json()).toEqual({ user: null });
  });

  it("answers 401 to a signed-out POST to a protected route", async () => {
    const { app } = appWith();
    expect((await visit(app, new Browser(), "/save", form({ x: "1" }))).status).toBe(401);
  });

  it("takes logout tokens through the routes, with a store", async () => {
    const { app } = appWith({ store: memoryStore() });
    const browser = new Browser();
    issuer.settings.extraClaims = { sid: "idp-session-1" };
    await signIn(app, browser);
    const response = await app.request(`${APP_URL}/auth/backchannel-logout`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ logout_token: await issuer.logoutToken() }).toString(),
    });
    expect(response.status).toBe(200);
    expect(await (await visit(app, browser, "/")).json()).toEqual({ user: null });
  });
});

describe("Hono: protecting an API", () => {
  const call = async (app: App, authorization?: string) => {
    const response = await app.request(`${APP_URL}/api/orders`, {
      headers: authorization ? { authorization } : {},
    });
    return {
      status: response.status,
      challenge: response.headers.get("www-authenticate"),
      body: await response.json().catch(() => null),
    };
  };

  it("lets a good token through, with the token on the context", async () => {
    const { app } = appWith();
    expect(await call(app, `Bearer ${await issuer.accessToken()}`)).toMatchObject({
      status: 200,
      body: { subject: "user-1" },
    });
  });

  it("answers 401 without a token or with a bad one, and 403 for a missing scope", async () => {
    const { app } = appWith();
    expect(await call(app)).toMatchObject({ status: 401, challenge: "Bearer" });
    expect((await call(app, "Bearer not-a-jwt")).status).toBe(401);
    const scoped = await call(app, `Bearer ${await issuer.accessToken({ scope: "openid" })}`);
    expect(scoped.status).toBe(403);
    expect(scoped.challenge).toContain('scope="orders:read"');
  });

  it("answers 503 when the token can't be checked, never letting it through", async () => {
    const { app } = appWith();
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("fetch failed")));
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const answer = await call(app, `Bearer ${await issuer.accessToken()}`);
    expect(answer.status).toBe(503);
    expect(String(logged.mock.calls[0]?.[0])).not.toContain("Bearer");
  });
});
