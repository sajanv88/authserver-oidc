// nextidp on an edge runtime: test/edge-worker.ts bundled for a platform with no Node APIs
// (esbuild fails the bundle if anything imports one), then run in Cloudflare's workerd through
// Miniflare, without Node compatibility. The fake auth server stays in this process: the
// Worker's outgoing requests come back here. Sign-in, refresh, sign-out, back-channel logout,
// API tokens and service tokens all run inside the Worker.
import { join } from "node:path";
import { build } from "esbuild";
import { Miniflare, type Request as WorkerRequest, Response as WorkerResponse } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  API_CLIENT_ID,
  API_CLIENT_SECRET,
  API_URL,
  APP_URL,
  Browser,
  CLIENT_ID,
  type FakeIssuer,
  fakeIssuer,
  ISSUER,
  SECRET,
} from "../test/fake-issuer.js";

let issuer: FakeIssuer;
let worker: Miniflare;
let bundled: { inputs: string[] };

beforeAll(async () => {
  issuer = await fakeIssuer();
  const result = await build({
    entryPoints: [join(import.meta.dirname, "../test/edge-worker.ts")],
    bundle: true,
    write: false,
    format: "esm",
    // No Node built-ins on this platform: importing one fails the build.
    platform: "neutral",
    conditions: ["workerd", "worker", "browser"],
    mainFields: ["module", "main"],
    target: "es2024",
    metafile: true,
    logLevel: "silent",
  });
  bundled = { inputs: Object.keys(result.metafile.inputs) };
  worker = new Miniflare({
    modules: true,
    script: result.outputFiles[0]?.text ?? "",
    compatibilityDate: "2026-07-01",
    bindings: {
      ISSUER,
      CLIENT_ID,
      APP_URL,
      SECRET,
      AUDIENCE: API_URL,
      SERVICE_CLIENT_ID: API_CLIENT_ID,
      SERVICE_CLIENT_SECRET: API_CLIENT_SECRET,
    },
    // Every fetch the Worker makes (discovery, keys, tokens) goes to the fake auth server.
    async outboundService(request: WorkerRequest) {
      const method = request.method;
      const answer = await issuer.fetch(request.url, {
        method,
        headers: Object.fromEntries(request.headers),
        ...(method === "GET" || method === "HEAD" ? {} : { body: await request.text() }),
      });
      return new WorkerResponse(await answer.arrayBuffer(), {
        status: answer.status,
        headers: Object.fromEntries(answer.headers),
      });
    },
  });
}, 60_000);

afterAll(async () => {
  await worker?.dispose();
});

/** A request to the Worker from `browser`; redirects not followed. */
async function visit(browser: Browser, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (browser.header) headers.set("cookie", browser.header);
  const answer = await worker.dispatchFetch(`${APP_URL}${path}`, {
    method: init.method ?? "GET",
    headers: Object.fromEntries(headers),
    redirect: "manual",
    ...(typeof init.body === "string" ? { body: init.body } : {}),
  });
  const copy = new Headers();
  for (const [name, value] of answer.headers) copy.append(name, value);
  for (const cookie of answer.headers.getSetCookie()) copy.append("set-cookie", cookie);
  return browser.take(
    new Response(answer.status === 204 ? null : await answer.arrayBuffer(), {
      status: answer.status,
      headers: copy,
    }),
  );
}

async function signIn(browser: Browser, returnTo = "/") {
  const login = await visit(browser, `/auth/login?${new URLSearchParams({ returnTo })}`);
  const authorize = login.headers.get("location") ?? "";
  expect(authorize.startsWith(`${ISSUER}/authorize?`)).toBe(true);
  const code = issuer.issueCode(authorize);
  const state = new URL(authorize).searchParams.get("state") ?? "";
  return visit(browser, `/auth/callback?${new URLSearchParams({ code, state })}`);
}

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { origin: APP_URL, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

describe("on an edge runtime (Cloudflare workerd, no Node compatibility)", () => {
  it("bundles with no Node built-ins, and runs where there's no process", async () => {
    expect(bundled.inputs.some((input) => input.startsWith("node:"))).toBe(false);
    expect(
      bundled.inputs.some((input) => /src[\\/](node|express|nestjs|next)\.ts$/.test(input)),
    ).toBe(false);
    expect(await (await visit(new Browser(), "/runtime")).json()).toEqual({ process: "undefined" });
  });

  it("signs in: PKCE, the ID token's checks and the sealed cookies, in the Worker", async () => {
    const browser = new Browser();
    const away = await visit(browser, "/dashboard");
    expect(away.status).toBe(302);
    expect(away.headers.get("location")).toBe(`${APP_URL}/auth/login?returnTo=%2Fdashboard`);
    expect((await signIn(browser, "/dashboard")).headers.get("location")).toBe(
      `${APP_URL}/dashboard`,
    );
    expect(await (await visit(browser, "/dashboard")).json()).toMatchObject({ user: "user-1" });
  });

  it("refreshes a token about to expire", async () => {
    issuer.settings.accessTokenLifetime = 30;
    try {
      const browser = new Browser();
      await signIn(browser);
      const first = (await (await visit(browser, "/dashboard")).json()) as { accessToken: string };
      const second = (await (await visit(browser, "/dashboard")).json()) as {
        accessToken: string;
      };
      expect(second.accessToken).not.toBe(first.accessToken);
    } finally {
      issuer.settings.accessTokenLifetime = 600;
    }
  });

  it("signs out, and ends sessions by back-channel logout", async () => {
    const leaving = new Browser();
    await signIn(leaving);
    expect((await visit(leaving, "/auth/logout", form({}))).status).toBe(303);
    expect(await (await visit(leaving, "/")).json()).toEqual({ user: null });

    issuer.settings.extraClaims = { sid: "edge-session" };
    try {
      const ended = new Browser();
      await signIn(ended);
      const logout = await visit(
        new Browser(),
        "/auth/backchannel-logout",
        form({ logout_token: await issuer.logoutToken({ sid: "edge-session" }) }),
      );
      expect(logout.status).toBe(200);
      expect(await (await visit(ended, "/")).json()).toEqual({ user: null });
    } finally {
      issuer.settings.extraClaims = {};
    }
  });

  it("checks an API's access tokens against the issuer's keys", async () => {
    const call = (authorization: string) =>
      visit(new Browser(), "/api/orders", { headers: { authorization } });
    const good = await call(`Bearer ${await issuer.accessToken()}`);
    expect(await good.json()).toEqual({ subject: "user-1" });
    const scoped = await call(`Bearer ${await issuer.accessToken({ scope: "openid" })}`);
    expect(scoped.status).toBe(403);
    expect(scoped.headers.get("www-authenticate")).toContain('scope="orders:read"');
  });

  it("gets a service token with client credentials", async () => {
    const { token } = (await (await visit(new Browser(), "/service-token")).json()) as {
      token: string;
    };
    expect(token).toMatch(/\S+/);
  });
});
