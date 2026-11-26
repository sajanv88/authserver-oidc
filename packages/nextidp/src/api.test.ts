// Protecting an API: the access token checks, then each adapter against the real thing (a Node
// HTTP server for Express-style middleware, NextRequest for withToken, a NestJS application).
import "reflect-metadata";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { UnsecuredJWT } from "jose";
import { NextRequest } from "next/server.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_CLIENT_ID,
  API_CLIENT_SECRET,
  API_URL,
  CLIENT_ID,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
} from "../test/fake-issuer.js";
import type { AccessToken } from "./access-token.js";
import { bearerToken } from "./access-token.js";
import { isTokenError } from "./errors.js";
import { idp as expressIdp } from "./express.js";
import { createIdp } from "./idp.js";
import { CurrentToken, IdpModule, Public, Scopes } from "./nestjs.js";
import { idp as nextIdp } from "./next.js";

let issuer: FakeIssuer;
const realFetch = globalThis.fetch;

/** The fake auth server for its own URLs; the real network for the servers under test. */
function stubFetch() {
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith(ISSUER) ? issuer.fetch(input, init) : realFetch(input, init);
  });
}

// One issuer for the whole file: the servers below live across tests, and keep its keys.
beforeAll(async () => {
  issuer = await fakeIssuer();
});

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const api = (options = {}) => createIdp({ issuer: ISSUER, audience: API_URL, env: {}, ...options });

/** The error a check throws, to look at its code, status and message. */
async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isTokenError(error)) return error;
    throw error;
  }
  throw new Error("It was accepted.");
}

describe("checking an access token", () => {
  it("accepts the issuer's JWT for this API, and says who it's for", async () => {
    const token = await api().verifyAccessToken(await issuer.accessToken(), {
      scopes: ["orders:read"],
    });
    expect(token).toMatchObject({
      subject: "user-1",
      clientId: CLIENT_ID,
      isService: false,
      scopes: ["openid", "orders:read"],
      audience: [API_URL, `${ISSUER}/api/auth/oauth2/userinfo`],
    });
  });

  it("knows a service calling as itself: its subject is its client", async () => {
    const jwt = await issuer.accessToken({ sub: "jobs", client_id: "jobs", azp: "jobs" });
    expect((await api().verifyAccessToken(jwt)).isService).toBe(true);
  });

  it("needs only the issuer and audience, and falls back to resource for the audience", async () => {
    expect(api().apiConfig()).toEqual({
      issuer: ISSUER,
      audience: API_URL,
      clientId: undefined,
      clientSecret: undefined,
    });
    expect(createIdp({ issuer: ISSUER, resource: API_URL, env: {} }).apiConfig().audience).toBe(
      API_URL,
    );
    expect(() => createIdp({ issuer: ISSUER, env: {} }).apiConfig()).toThrow(
      /audience \(IDP_AUDIENCE\) is required/,
    );
  });

  it("refuses a token for another API, from another issuer's key, or expired", async () => {
    for (const jwt of [
      await issuer.accessToken({}, { aud: "https://other-api.example.test" }),
      await issuer.accessToken({}, { forge: true }),
      await issuer.accessToken({}, { exp: "-5m" }),
    ]) {
      expect((await refusal(api().verifyAccessToken(jwt))).code).toBe("invalid_token");
    }
  });

  it("refuses a token typed as something else (an ID token), and an unsigned one", async () => {
    const typed = await issuer.accessToken({}, { typ: "JWT" });
    expect((await refusal(api().verifyAccessToken(typed))).message).toMatch(/typ/);
    const unsigned = new UnsecuredJWT({ sub: "user-1", scope: "orders:read" })
      .setIssuer(ISSUER)
      .setAudience(API_URL)
      .setExpirationTime("10m")
      .encode();
    expect((await refusal(api().verifyAccessToken(unsigned))).code).toBe("invalid_token");
  });

  it("refuses a token without a scope the route needs: 403, naming the scopes", async () => {
    const error = await refusal(
      api().verifyAccessToken(await issuer.accessToken(), {
        scopes: ["orders:read", "orders:write"],
      }),
    );
    expect(error).toMatchObject({ code: "insufficient_scope", status: 403 });
    const response = api().tokenErrorResponse(error);
    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer error="insufficient_scope", error_description="The access token lacks: orders:write.", scope="orders:read orders:write"',
    );
    expect(await response.json()).toEqual({
      error: "insufficient_scope",
      error_description: "The access token lacks: orders:write.",
    });
  });

  it("reads Bearer tokens only, and answers a missing one with a bare challenge", async () => {
    expect(bearerToken("Bearer abc.def-ghi_~+/=")).toBe("abc.def-ghi_~+/=");
    expect(bearerToken("bearer abc")).toBe("abc");
    for (const header of [undefined, "", "Basic abc", "Bearer", "Bearer a b"]) {
      expect(bearerToken(header)).toBeUndefined();
    }
    const error = await refusal(api().verifyBearer("Basic abc"));
    expect(error.code).toBe("missing_token");
    expect(api().tokenErrorResponse(error).headers.get("www-authenticate")).toBe("Bearer");
  });
});

describe("an opaque token, by introspection", () => {
  const introspecting = () => api({ clientId: API_CLIENT_ID, clientSecret: API_CLIENT_SECRET });

  it("is asked about with this API's credentials, and the answer is kept a minute", async () => {
    const auth = introspecting();
    const opaque = issuer.opaqueToken({ aud: API_URL });
    const before = issuer.calls("/introspect").length;
    expect((await auth.verifyAccessToken(opaque)).subject).toBe("user-1");
    await auth.verifyAccessToken(opaque);
    expect(issuer.calls("/introspect").length - before).toBe(1);
    // Revoked: still accepted from the cache, until the minute is up.
    issuer.revoke(opaque);
    expect((await auth.verifyAccessToken(opaque)).subject).toBe("user-1");
    expect((await refusal(introspecting().verifyAccessToken(opaque))).code).toBe("invalid_token");
  });

  it("accepts a token issued to this very client, and refuses one for another API", async () => {
    const own = issuer.opaqueToken({ client_id: API_CLIENT_ID });
    expect((await introspecting().verifyAccessToken(own)).clientId).toBe(API_CLIENT_ID);
    const elsewhere = issuer.opaqueToken({ aud: "https://other-api.example.test" });
    expect((await refusal(introspecting().verifyAccessToken(elsewhere))).message).toMatch(
      /another API/,
    );
  });

  it("can't be checked without credentials: the answer says to ask for JWTs", async () => {
    const before = issuer.calls("/introspect").length;
    const error = await refusal(api().verifyAccessToken(issuer.opaqueToken({ aud: API_URL })));
    expect(error.message).toMatch(/clientId and clientSecret/);
    expect(issuer.calls("/introspect").length).toBe(before);
  });
});

describe("Express-style middleware", () => {
  let server: Server;
  let base: string;
  const auth = expressIdp({ issuer: ISSUER, audience: API_URL, env: {} });
  const failures: unknown[] = [];

  beforeAll(async () => {
    const guard = auth.requireToken({ scopes: ["orders:read"] });
    server = createServer((req, res) => {
      guard(req, res, (error) => {
        if (error) {
          failures.push(error);
          res.statusCode = 500;
          res.end();
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ subject: auth.tokenOf(req)?.subject }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  const call = async (authorization?: string) => {
    const response = await realFetch(`${base}/orders`, {
      headers: authorization ? { authorization } : {},
    });
    return {
      status: response.status,
      challenge: response.headers.get("www-authenticate"),
      body: await response.json().catch(() => null),
    };
  };

  it("lets a good token through, with the token on the request", async () => {
    expect(await call(`Bearer ${await issuer.accessToken()}`)).toMatchObject({
      status: 200,
      body: { subject: "user-1" },
    });
  });

  it("answers 401 without a token, 401 for a bad one and 403 for a missing scope", async () => {
    expect(await call()).toMatchObject({ status: 401, challenge: "Bearer" });
    expect(await call("Bearer not-a-jwt")).toMatchObject({ status: 401 });
    const readless = await issuer.accessToken({ scope: "openid" });
    const scoped = await call(`Bearer ${readless}`);
    expect(scoped.status).toBe(403);
    expect(scoped.challenge).toContain('scope="orders:read"');
  });

  it("hands a token it can't check now to next(error), never through", async () => {
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.startsWith(ISSUER)
        ? Promise.reject(new TypeError("fetch failed"))
        : realFetch(input, init);
    });
    const down = expressIdp({ issuer: ISSUER, audience: API_URL, env: {} });
    const guard = down.requireToken();
    const passed = await new Promise<unknown>((resolve) => {
      const req = Object.assign(Object.create(null), {
        headers: { authorization: "Bearer a.b.c" },
      });
      guard(req, {} as never, resolve);
    });
    expect(passed).toBeDefined();
  });
});

describe("Next.js route handlers", () => {
  const auth = nextIdp({ issuer: ISSUER, audience: API_URL, env: {} });
  const handler = auth.withToken({ scopes: ["orders:read"] }, (_request, { token }) =>
    Response.json({ subject: token.subject }),
  );
  const request = (authorization?: string) =>
    new NextRequest(`${API_URL}/api/orders`, { headers: authorization ? { authorization } : {} });

  it("runs the handler with the token, and refuses without one", async () => {
    const ok = await handler(request(`Bearer ${await issuer.accessToken()}`), {});
    expect(await ok.json()).toEqual({ subject: "user-1" });
    const refused = await handler(request(), {});
    expect(refused.status).toBe(401);
    expect(refused.headers.get("www-authenticate")).toBe("Bearer");
  });
});

describe("NestJS", () => {
  let app: Awaited<ReturnType<typeof NestFactory.create>>;
  let base: string;

  // A controller as an app writes it, with the decorators applied as calls: this file isn't
  // compiled with decorator support.
  class OrdersController {
    list(token: AccessToken) {
      return { subject: token.subject, scopes: token.scopes };
    }
    remove() {
      return { removed: true };
    }
    health() {
      return { ok: true };
    }
  }
  const method = (name: keyof OrdersController) =>
    Object.getOwnPropertyDescriptor(OrdersController.prototype, name) as PropertyDescriptor;
  Controller("orders")(OrdersController);
  Scopes("orders:read")(OrdersController);
  Get()(OrdersController.prototype, "list", method("list"));
  CurrentToken()(OrdersController.prototype, "list", 0);
  Get("remove")(OrdersController.prototype, "remove", method("remove"));
  Scopes("orders:write")(OrdersController.prototype, "remove", method("remove"));
  Get("health")(OrdersController.prototype, "health", method("health"));
  Public()(OrdersController.prototype, "health", method("health"));

  class AppModule {}
  Module({
    imports: [IdpModule.forRoot({ issuer: ISSUER, audience: API_URL, env: {} })],
    controllers: [OrdersController],
  })(AppModule);

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  const call = async (path: string, token?: string) => {
    const response = await realFetch(`${base}${path}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    return {
      status: response.status,
      challenge: response.headers.get("www-authenticate"),
      body: await response.json(),
    };
  };

  it("guards every route, and @Public() opens one", async () => {
    expect(await call("/orders")).toMatchObject({ status: 401, challenge: "Bearer" });
    expect(await call("/orders/health")).toMatchObject({ status: 200, body: { ok: true } });
  });

  it("gives the route the token through @CurrentToken()", async () => {
    expect(await call("/orders", await issuer.accessToken())).toMatchObject({
      status: 200,
      body: { subject: "user-1", scopes: ["openid", "orders:read"] },
    });
  });

  it("adds a route's @Scopes() to its controller's: both are needed", async () => {
    const readOnly = await call("/orders/remove", await issuer.accessToken());
    expect(readOnly.status).toBe(403);
    expect(readOnly.challenge).toContain('scope="orders:read orders:write"');
    const both = await issuer.accessToken({ scope: "orders:read orders:write" });
    expect(await call("/orders/remove", both)).toMatchObject({
      status: 200,
      body: { removed: true },
    });
  });

  it("refuses a token for another API", async () => {
    const other = await issuer.accessToken({}, { aud: "https://other-api.example.test" });
    expect((await call("/orders", other)).status).toBe(401);
  });
});
