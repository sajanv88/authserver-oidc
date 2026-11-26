// A service's own tokens (client credentials) against the fake auth server: what's asked for,
// what's kept and for how long, refusals, and fast-http-client putting them on requests.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHttp, HttpError } from "fast-http-client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_CLIENT_ID,
  API_CLIENT_SECRET,
  API_URL,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
} from "../test/fake-issuer.js";
import type { IdpOptions } from "./config.js";
import { isIdpError } from "./errors.js";
import { createIdp } from "./idp.js";

let issuer: FakeIssuer;
const realFetch = globalThis.fetch;

beforeEach(async () => {
  issuer = await fakeIssuer();
  vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    return url.startsWith(ISSUER) ? issuer.fetch(input, init) : realFetch(input, init);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const service = (options: IdpOptions = {}) =>
  createIdp({
    issuer: ISSUER,
    clientId: API_CLIENT_ID,
    clientSecret: API_CLIENT_SECRET,
    env: {},
    ...options,
  });

const asked = () =>
  issuer
    .calls("/token")
    .map((call) => new URLSearchParams(call.body))
    .filter((form) => form.get("grant_type") === "client_credentials");

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    if (isIdpError(error)) return error;
    throw error;
  }
  throw new Error("It succeeded.");
}

describe("a service token", () => {
  it("is asked for with the client's credentials, the scopes and the API", async () => {
    const token = await service().serviceToken({
      scopes: ["orders:read", "orders:write"],
      resource: API_URL,
    });
    expect(token).toMatch(/\S+/);
    const [form] = asked();
    expect(form?.get("scope")).toBe("orders:read orders:write");
    expect(form?.get("resource")).toBe(API_URL);
    expect(form?.has("client_id")).toBe(false); // Basic, not the body
    expect(issuer.calls("/token")[0]?.headers.get("authorization")).toBe(
      `Basic ${btoa(`${API_CLIENT_ID}:${API_CLIENT_SECRET}`)}`,
    );
  });

  it("is for IDP_RESOURCE when a call names no API", async () => {
    await service({ env: { IDP_RESOURCE: API_URL } }).serviceToken();
    expect(asked()[0]?.get("resource")).toBe(API_URL);
    expect(asked()[0]?.has("scope")).toBe(false);
  });

  it("is kept per scopes and API: asked for again only for a different one", async () => {
    const auth = service();
    const first = await auth.serviceToken({ scopes: ["a", "b"], resource: API_URL });
    expect(await auth.serviceToken({ scopes: ["b", "a", "a"], resource: API_URL })).toBe(first);
    expect(asked()).toHaveLength(1);
    expect(await auth.serviceToken({ scopes: ["a"], resource: API_URL })).not.toBe(first);
    expect(await auth.serviceToken({ scopes: ["a", "b"] })).not.toBe(first);
    expect(asked()).toHaveLength(3);
  });

  it("is asked for once by calls at the same time", async () => {
    const auth = service();
    const tokens = await Promise.all([1, 2, 3].map(() => auth.serviceToken({ scopes: ["a"] })));
    expect(new Set(tokens).size).toBe(1);
    expect(asked()).toHaveLength(1);
  });

  it("is renewed a minute before it expires, or halfway through a short life", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const auth = service();
    const first = await auth.serviceToken();
    vi.advanceTimersByTime(539_000); // 600 s life, renewed after 540
    expect(await auth.serviceToken()).toBe(first);
    vi.advanceTimersByTime(1_000);
    expect(await auth.serviceToken()).not.toBe(first);

    issuer.settings.serviceTokenLifetime = 40;
    const short = await auth.serviceToken({ scopes: ["short"] });
    vi.advanceTimersByTime(19_000);
    expect(await auth.serviceToken({ scopes: ["short"] })).toBe(short);
    vi.advanceTimersByTime(1_000);
    expect(await auth.serviceToken({ scopes: ["short"] })).not.toBe(short);
  });

  it("isn't kept when the auth server gives no lifetime", async () => {
    issuer.settings.serviceTokenLifetime = undefined;
    const auth = service();
    expect(await auth.serviceToken()).not.toBe(await auth.serviceToken());
  });

  it("is asked for again when fresh, or once an API refused it", async () => {
    const auth = service();
    const first = await auth.serviceToken();
    const fresh = await auth.serviceToken({ fresh: true });
    expect(fresh).not.toBe(first);
    auth.dropServiceToken(fresh);
    expect(await auth.serviceToken()).not.toBe(fresh);
    expect(asked()).toHaveLength(3);
  });

  it("fails with the auth server's refusal, which isn't kept", async () => {
    const auth = service();
    const refused = await failure(auth.serviceToken({ scopes: ["forbidden"] }));
    expect(refused).toMatchObject({ code: "service_token_failed", status: 400 });
    expect(refused.message).toContain("invalid_scope");
    await failure(auth.serviceToken({ scopes: ["forbidden"] }));
    expect(asked()).toHaveLength(2);

    const wrong = await failure(service({ clientSecret: "wrong" }).serviceToken());
    expect(wrong).toMatchObject({ code: "service_token_failed", status: 401 });
    expect(wrong.message).not.toContain("wrong");
  });

  it("needs a confidential client, and says so", async () => {
    const missing = await failure(createIdp({ issuer: ISSUER, env: {} }).serviceToken());
    expect(missing.code).toBe("misconfigured");
    expect(missing.message).toContain("clientId (IDP_CLIENT_ID)");
    expect(missing.message).toContain("clientSecret (IDP_CLIENT_SECRET)");
    expect((await failure(service().serviceToken({ resource: "not a uri" }))).code).toBe(
      "misconfigured",
    );
  });

  it("refuses a resource with spaces, so a resource and scopes can't pass for another pair", async () => {
    const refused = await failure(service().serviceToken({ resource: "urn:a b", scopes: ["c"] }));
    expect(refused.code).toBe("misconfigured");
    expect(asked()).toHaveLength(0);
  });
});

describe("fast-http-client with a service token", () => {
  let server: Server;
  let base: string;
  /** Tokens the API refuses, as if revoked; and every Authorization header it saw. */
  const refused = new Set<string>();
  const seen: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const authorization = req.headers.authorization ?? "";
      seen.push(authorization);
      const token = authorization.replace(/^Bearer /, "");
      res.setHeader("content-type", "application/json");
      if (!authorization.startsWith("Bearer ") || refused.has(token)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: "invalid_token" }));
        return;
      }
      res.end(JSON.stringify({ orders: [], token }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    refused.clear();
    seen.length = 0;
  });

  const client = () => createHttp({ baseUrl: base, retry: false, circuitBreaker: false });

  it("puts the token on every request, in place of any Authorization already there", async () => {
    const auth = service();
    const orders = client();
    auth.useServiceToken(orders, { scopes: ["orders:read"], resource: API_URL, origins: [base] });
    const answer = await orders.get<{ token: string }>("/orders", {
      headers: { Authorization: "Bearer stale" },
    });
    expect(answer.data.token).toBe(
      await auth.serviceToken({ scopes: ["orders:read"], resource: API_URL }),
    );
    expect(seen).toEqual([`Bearer ${answer.data.token}`]);
    await orders.get("/orders");
    expect(asked()).toHaveLength(1);
  });

  it("gets a new token when the API refuses the kept one, and sends the request again", async () => {
    const auth = service();
    const orders = client();
    auth.useServiceToken(orders, { origins: [base] });
    const first = (await orders.get<{ token: string }>("/orders")).data.token;
    refused.add(first);
    const again = await orders.get<{ token: string }>("/orders");
    expect(again.data.token).not.toBe(first);
    expect(seen).toEqual([`Bearer ${first}`, `Bearer ${first}`, `Bearer ${again.data.token}`]);
  });

  it("gives up after one more try: a second 401 is the caller's", async () => {
    const auth = service();
    const orders = client();
    auth.useServiceToken(orders, { origins: [base] });
    refused.add(await auth.serviceToken());
    // Every token is refused from now on.
    const realHas = refused.has.bind(refused);
    refused.has = () => true;
    try {
      const error = await orders.get("/orders").catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(401);
      expect(seen).toHaveLength(2);
    } finally {
      refused.has = realHas;
    }
  });

  it("sends nothing when no token can be had, and can be taken off", async () => {
    const orders = client();
    const stop = service({ clientSecret: "wrong" }).useServiceToken(orders, { origins: [base] });
    const error = await orders.get("/orders").catch((caught: unknown) => caught);
    expect(isIdpError(error) && error.code).toBe("service_token_failed");
    expect(seen).toHaveLength(0);
    stop();
    await expect(orders.get("/orders")).rejects.toMatchObject({ status: 401 });
    expect(seen).toEqual([""]);
  });

  it("checks its settings when it's set up, not at the first request", () => {
    expect(() => createIdp({ issuer: ISSUER, env: {} }).useServiceToken(client())).toThrow(
      /clientSecret/,
    );
  });

  it("sends the token to the API's origin only: never to a URL elsewhere", async () => {
    const auth = service();
    const orders = client();
    auth.useServiceToken(orders, { origins: [base] });
    // The same server under another name is another origin, as is a protocol-relative URL.
    const elsewhere = base.replace("127.0.0.1", "localhost");
    await orders.get(`${elsewhere}/orders`).catch(() => undefined);
    await orders.get(`//${new URL(elsewhere).host}/orders`).catch(() => undefined);
    expect(seen).toEqual(["", ""]);
    // No new token was asked for, and none was sent on a retry either.
    expect(asked()).toHaveLength(0);
    await orders.get(`${base}/orders`);
    expect(seen[2]).toMatch(/^Bearer \S+$/);
  });

  it("takes the API's origin from an http(s) resource", async () => {
    const orders = client();
    service().useServiceToken(orders, { resource: `${base}/` });
    await orders.get("/orders");
    expect(seen[0]).toMatch(/^Bearer \S+$/);
  });

  it("refuses to start without knowing where the token may go", () => {
    expect(() => service().useServiceToken(client())).toThrow(/origins/);
    expect(() => service().useServiceToken(client(), { resource: "urn:orders" })).toThrow(
      /origins/,
    );
    expect(() => service().useServiceToken(client(), { origins: ["ftp://x"] })).toThrow(
      /http\(s\)/,
    );
  });
});
