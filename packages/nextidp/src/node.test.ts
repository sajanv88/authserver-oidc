// Signing in on Node's own HTTP server and in Express, each a real server reached over HTTP,
// against the fake auth server: the routes, the session, refreshing, signing out.
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import express, {
  type Request as ExpressRequest,
  type Response as ExpressResponse,
  type NextFunction,
} from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_URL,
  Browser,
  CLIENT_ID,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
  SECRET,
} from "../test/fake-issuer.js";
import type { IdpOptions } from "./config.js";
import { idp as expressIdp } from "./express.js";
import { idp as nodeIdp } from "./node.js";
import { MAX_FORM_BYTES, toWebRequest } from "./node-http.js";

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

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

type Visit = { method?: string; form?: Record<string, string>; origin?: string; body?: string };

/** A request from `browser` to the server at `base`, its cookies kept; redirects not followed. */
async function visit(base: string, browser: Browser, path: string, options: Visit = {}) {
  const headers = new Headers();
  if (browser.header) headers.set("cookie", browser.header);
  let body: string | undefined = options.body;
  if (options.form) body = new URLSearchParams(options.form).toString();
  if (body !== undefined) {
    headers.set("content-type", "application/x-www-form-urlencoded");
    headers.set("origin", options.origin ?? APP_URL);
  }
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

describe("Express", () => {
  const auth = expressIdp(settings);
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const app = express();
    // A body parser before nextidp reads the sign-out form first: nextidp must still see it.
    app.use(express.urlencoded({ extended: false }));
    app.use(auth.express());
    app.get("/", (req, res) => {
      res.json({ user: auth.sessionOf(req)?.user.id ?? null });
    });
    app.get("/dashboard", auth.requireSession(), (req, res) => {
      const session = auth.sessionOf(req);
      res.json({ user: session?.user.id, accessToken: session?.accessToken });
    });
    app.post("/save", auth.requireSession(), (_req, res) => {
      res.json({ saved: true });
    });
    app.use((error: unknown, _req: ExpressRequest, res: ExpressResponse, _next: NextFunction) => {
      failures.push(error);
      res.status(500).end();
    });
    server = createServer(app);
    base = await listen(server);
  });

  afterAll(() => {
    server.close();
  });

  it("sends a signed-out visitor of a protected page to sign in, and back to it after", async () => {
    const browser = new Browser();
    const away = await visit(base, browser, "/dashboard?tab=2");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe(
      `${APP_URL}/auth/login?${new URLSearchParams({ returnTo: "/dashboard?tab=2" })}`,
    );

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

  it("refreshes an access token about to expire, and the page gets the new one", async () => {
    issuer.settings.accessTokenLifetime = 30; // inside the minute's leeway
    const browser = new Browser();
    await signIn(base, browser, "/dashboard");
    const before = await auth.getSession(browser.header);
    const refreshes = issuer.calls("/token").length;

    const page = await visit(base, browser, "/dashboard");
    expect(page.headers.getSetCookie().join()).toContain("nextidp.session");
    const { accessToken } = (await page.json()) as { accessToken: string };
    expect(accessToken).not.toBe(before?.accessToken);
    expect(issuer.calls("/token").length).toBe(refreshes + 1);
    // The browser now holds the refreshed session.
    expect((await auth.getSession(browser.header))?.accessToken).toBe(accessToken);
  });

  it("signs out with the form, through a body parser that read it first", async () => {
    const browser = new Browser();
    await signIn(base, browser, "/");
    const out = await visit(base, browser, "/auth/logout", { form: { signOutOfIdp: "true" } });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")?.startsWith(`${ISSUER}/end-session?`)).toBe(true);
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

  it("answers 401 to a signed-out POST to a protected route", async () => {
    const out = await visit(base, new Browser(), "/save", { form: { name: "x" } });
    expect(out.status).toBe(401);
  });

  it("says so when the session is read without auth.express()", () => {
    expect(() => auth.sessionOf({} as IncomingMessage)).toThrow(/auth\.express\(\)/);
  });
});

describe("Node's HTTP server", () => {
  const auth = nodeIdp(settings);
  let server: Server;
  let base: string;

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      try {
        if (await auth.handle(req, res)) return;
        const session = await auth.requireSession(req, res);
        if (!session) return;
        // Read twice in one request: the same session, no second refresh.
        const again = await auth.session(req, res);
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ user: session.user.id, same: again === session }));
      } catch (error) {
        failures.push(error);
        res.statusCode = 500;
        res.end();
      }
    });
    base = await listen(server);
  });

  afterAll(() => {
    server.close();
  });

  it("signs in, and the page gets the session", async () => {
    const browser = new Browser();
    const away = await visit(base, browser, "/account");
    expect(away.headers.get("location")).toBe(`${APP_URL}/auth/login?returnTo=%2Faccount`);
    expect((await signIn(base, browser, "/account")).headers.get("location")).toBe(
      `${APP_URL}/account`,
    );
    expect(await (await visit(base, browser, "/account")).json()).toEqual({
      user: "user-1",
      same: true,
    });
  });

  it("signs out with the form, read from the request itself, and revokes the refresh token", async () => {
    const browser = new Browser();
    await signIn(base, browser, "/account");
    const revoked = issuer.calls("/revoke").length;
    const out = await visit(base, browser, "/auth/logout", { form: { signOutOfIdp: "false" } });
    expect(out.status).toBe(303);
    expect(out.headers.get("location")).toBe(`${APP_URL}/`);
    expect(issuer.calls("/revoke").length).toBe(revoked + 1);
    expect((await visit(base, browser, "/account")).status).toBe(302);
  });

  it("refuses a body too big for a form, unread", async () => {
    const out = await visit(base, new Browser(), "/auth/logout", {
      body: "x".repeat(MAX_FORM_BYTES + 1),
    });
    expect(out.status).toBe(413);
  });

  it("answers 404 for an unknown route under the base path, and 405 for the wrong method", async () => {
    expect((await visit(base, new Browser(), "/auth/nothing")).status).toBe(404);
    expect((await visit(base, new Browser(), "/auth/logout")).status).toBe(405);
  });
});

describe("the request handed to the core", () => {
  const request = (fields: Partial<IncomingMessage>) =>
    Object.assign(Readable.from([]), { headers: {}, method: "GET", ...fields }) as IncomingMessage;

  it("is on the app's own origin, whatever the Host header or the path says", async () => {
    const web = await toWebRequest(
      request({ url: "//evil.example/auth/login?x=1", headers: { host: "evil.example" } }),
      APP_URL,
    );
    expect(new URL(web.url).origin).toBe(APP_URL);
    expect(new URL(web.url).pathname).toBe("//evil.example/auth/login");
  });

  it("uses Express's originalUrl when mounted under a path", async () => {
    const web = await toWebRequest(
      Object.assign(request({ url: "/login" }), { originalUrl: "/auth/login" }),
      APP_URL,
    );
    expect(web.url).toBe(`${APP_URL}/auth/login`);
  });
});
