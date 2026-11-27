// Signing in on a real Fastify server reached over HTTP, against the fake auth server: the
// routes, the session, refreshing, signing out; and its APIs' bearer tokens.
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
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
import { idp } from "./fastify.js";
import { MAX_FORM_BYTES } from "./node-http.js";

let issuer: FakeIssuer;
const realFetch = globalThis.fetch;
const failures: unknown[] = [];

// One issuer for the whole file: the servers below live across tests, and keep its keys.
beforeAll(async () => {
  issuer = await fakeIssuer();
});

beforeEach(() => {
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith(ISSUER) ? issuer.fetch(input, init) : realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  issuer.settings.accessTokenLifetime = 600;
  expect(failures).toEqual([]);
});

const settings: IdpOptions = {
  issuer: ISSUER,
  clientId: CLIENT_ID,
  appUrl: APP_URL,
  secret: SECRET,
  env: {},
  onError: (error) => failures.push(error),
};

type Visit = {
  method?: string;
  form?: Record<string, string>;
  json?: unknown;
  origin?: string;
  body?: string;
};

/** A request from `browser` to the server at `base`, its cookies kept; redirects not followed. */
async function visit(base: string, browser: Browser, path: string, options: Visit = {}) {
  const headers = new Headers();
  if (browser.header) headers.set("cookie", browser.header);
  let body: string | undefined = options.body;
  if (options.form) body = new URLSearchParams(options.form).toString();
  if (body !== undefined) headers.set("content-type", "application/x-www-form-urlencoded");
  if (options.json !== undefined) {
    body = JSON.stringify(options.json);
    headers.set("content-type", "application/json");
  }
  if (body !== undefined) headers.set("origin", options.origin ?? APP_URL);
  const response = await realFetch(`${base}${path}`, {
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    headers,
    redirect: "manual",
    ...(body === undefined ? {} : { body }),
  });
  return browser.take(response);
}

/** Signs in through the server's routes, as a browser would; returns the callback's answer. */
async function signIn(base: string, browser: Browser, returnTo: string) {
  const login = await visit(base, browser, `/auth/login?${new URLSearchParams({ returnTo })}`);
  const authorize = login.headers.get("location") ?? "";
  expect(authorize.startsWith(`${ISSUER}/authorize?`)).toBe(true);
  const code = issuer.issueCode(authorize);
  const state = new URL(authorize).searchParams.get("state") ?? "";
  return visit(base, browser, `/auth/callback?${new URLSearchParams({ code, state })}`);
}

describe("Fastify, signing in", () => {
  const auth = idp(settings);
  let app: FastifyInstance;
  let base: string;
  // Fastify's warnings and errors: a route nextidp answered must leave it nothing to send.
  const logged: string[] = [];

  beforeAll(async () => {
    app = Fastify({ logger: { level: "warn", stream: { write: (line) => logged.push(line) } } });
    app.setErrorHandler((error, _request, reply) => {
      failures.push(error);
      void reply.code(500).send();
    });
    await app.register(auth.fastify());
    app.get("/", async (request) => ({ user: auth.sessionOf(request)?.user.id ?? null }));
    app.get("/dashboard", { onRequest: auth.requireSession() }, async (request, reply) => {
      // The route's own cookie: a refreshed session's must go out beside it.
      reply.header("set-cookie", "theme=dark; Path=/");
      const session = auth.sessionOf(request);
      return { user: session?.user.id, accessToken: session?.accessToken };
    });
    app.post<{ Body: { name: string } }>(
      "/save",
      { preHandler: auth.requireSession() },
      async (request) => ({ saved: request.body.name }),
    );
    // Under a prefix, in a plugin of its own: the session is read there too.
    await app.register(
      async (child) => {
        child.get("/me", { onRequest: auth.requireSession() }, async (request) => ({
          user: auth.sessionOf(request)?.user.id,
        }));
      },
      { prefix: "/v1" },
    );
    base = await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterEach(() => {
    expect(logged).toEqual([]);
  });

  afterAll(async () => {
    await app.close();
  });

  it("sends a signed-out visitor of a protected page to sign in, and back to it after", async () => {
    const browser = new Browser();
    const away = await visit(base, browser, "/dashboard?tab=2");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe(
      `${APP_URL}/auth/login?${new URLSearchParams({ returnTo: "/dashboard?tab=2" })}`,
    );
    expect(away.headers.get("cache-control")).toBe("no-store");

    const done = await signIn(base, browser, "/dashboard?tab=2");
    expect(done.headers.get("location")).toBe(`${APP_URL}/dashboard?tab=2`);
    const page = await visit(base, browser, "/dashboard");
    expect(page.status).toBe(200);
    expect(await page.json()).toMatchObject({ user: "user-1" });
  });

  it("reads the session on every page: null signed out, the person signed in", async () => {
    const browser = new Browser();
    expect(await (await visit(base, browser, "/")).json()).toEqual({ user: null });
    await signIn(base, browser, "/");
    expect(await (await visit(base, browser, "/")).json()).toEqual({ user: "user-1" });
  });

  it("reads it under a prefix, in another plugin's scope", async () => {
    const browser = new Browser();
    expect((await visit(base, browser, "/v1/me")).status).toBe(302);
    await signIn(base, browser, "/v1/me");
    expect(await (await visit(base, browser, "/v1/me")).json()).toEqual({ user: "user-1" });
  });

  it("refreshes an access token about to expire, its cookie beside the route's own", async () => {
    issuer.settings.accessTokenLifetime = 30; // inside the minute's leeway
    const browser = new Browser();
    await signIn(base, browser, "/dashboard");
    const before = await auth.getSession(browser.header);
    const refreshes = issuer.calls("/token").length;

    const page = await visit(base, browser, "/dashboard");
    const cookies = page.headers.getSetCookie().join();
    expect(cookies).toContain("nextidp.session");
    expect(cookies).toContain("theme=dark");
    const { accessToken } = (await page.json()) as { accessToken: string };
    expect(accessToken).not.toBe(before?.accessToken);
    expect(issuer.calls("/token").length).toBe(refreshes + 1);
    // The browser now holds the refreshed session.
    expect((await auth.getSession(browser.header))?.accessToken).toBe(accessToken);
  });

  it("signs out with the form, which Fastify alone would refuse, and revokes the refresh token", async () => {
    const browser = new Browser();
    await signIn(base, browser, "/");
    const revoked = issuer.calls("/revoke").length;
    const out = await visit(base, browser, "/auth/logout", { form: { signOutOfIdp: "false" } });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe(`${APP_URL}/`);
    expect(issuer.calls("/revoke").length).toBe(revoked + 1);
    expect(await (await visit(base, browser, "/")).json()).toEqual({ user: null });
  });

  it("refuses a sign-out posted from another site", async () => {
    const browser = new Browser();
    await signIn(base, browser, "/");
    const out = await visit(base, browser, "/auth/logout", {
      form: {},
      origin: "https://evil.example",
    });
    expect(out.status).toBe(403);
    expect(await (await visit(base, browser, "/")).json()).toEqual({ user: "user-1" });
  });

  it("answers 401 to a signed-out POST, and lets a signed-in one through with its body parsed", async () => {
    const browser = new Browser();
    const out = await visit(base, browser, "/save", { json: { name: "x" } });
    expect(out.status).toBe(401);
    expect(await out.text()).toBe("Sign in first.");
    await signIn(base, browser, "/");
    const saved = await visit(base, browser, "/save", { json: { name: "x" } });
    expect(await saved.json()).toEqual({ saved: "x" });
  });

  it("refuses a body too big for a form, and answers 404 and 405 under the base path", async () => {
    const big = await visit(base, new Browser(), "/auth/logout", {
      body: "x".repeat(MAX_FORM_BYTES + 1),
    });
    expect(big.status).toBe(413);
    expect((await visit(base, new Browser(), "/auth/nothing")).status).toBe(404);
    expect((await visit(base, new Browser(), "/auth/logout")).status).toBe(405);
  });

  it("says so when the session is read without auth.fastify()", () => {
    expect(() => auth.sessionOf({} as FastifyRequest)).toThrow(/auth\.fastify\(\)/);
  });
});

describe("Fastify, an API", () => {
  const auth = idp({ issuer: ISSUER, audience: API_URL, env: {} });
  let app: FastifyInstance;

  beforeAll(async () => {
    // No plugin: an API needs only the hook.
    app = Fastify();
    app.get(
      "/orders",
      { onRequest: auth.requireToken({ scopes: ["orders:read"] }) },
      async (request) => ({ subject: auth.tokenOf(request)?.subject }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const call = async (authorization?: string, server = app) => {
    const response = await server.inject({
      url: "/orders",
      headers: authorization ? { authorization } : {},
    });
    return {
      status: response.statusCode,
      challenge: response.headers["www-authenticate"],
      body: response.body ? response.json() : null,
    };
  };

  it("lets a good token through, with the token for the route", async () => {
    expect(await call(`Bearer ${await issuer.accessToken()}`)).toMatchObject({
      status: 200,
      body: { subject: "user-1" },
    });
  });

  it("answers 401 without a token, 401 for a bad one and 403 for a missing scope", async () => {
    expect(await call()).toMatchObject({ status: 401, challenge: "Bearer" });
    expect(await call("Bearer not-a-jwt")).toMatchObject({
      status: 401,
      body: { error: "invalid_token" },
    });
    const readless = await issuer.accessToken({ scope: "openid" });
    const scoped = await call(`Bearer ${readless}`);
    expect(scoped.status).toBe(403);
    expect(scoped.challenge).toContain('scope="orders:read"');
  });

  it("answers 503 for a token it can't check now, never letting it through", async () => {
    vi.stubGlobal("fetch", (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.startsWith(ISSUER)
        ? Promise.reject(new TypeError("fetch failed"))
        : Promise.reject(new Error(`unexpected fetch of ${url}`));
    });
    const down = idp({ issuer: ISSUER, audience: API_URL, env: {} });
    const server = Fastify();
    server.get("/orders", { onRequest: down.requireToken() }, async () => ({ through: true }));
    const answer = await call(`Bearer ${await issuer.accessToken()}`, server);
    expect(answer).toMatchObject({ status: 503, body: { error: "temporarily_unavailable" } });
    await server.close();
  });
});
