// `prompt` on the sign-in link, and asking for the password again after a sign-out
// (reauthenticateAfterSignOut): the authorize URL, and the marker cookie that remembers it.
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { idp as honoIdp } from "./hono.js";
import { createIdp } from "./idp.js";

let issuer: FakeIssuer;

beforeEach(async () => {
  issuer = await fakeIssuer();
  vi.stubGlobal("fetch", issuer.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const settings = (options: IdpOptions = {}): IdpOptions => ({
  issuer: ISSUER,
  clientId: CLIENT_ID,
  appUrl: APP_URL,
  secret: SECRET,
  env: {},
  onError: () => {},
  ...options,
});

const client = (options: IdpOptions = {}) => createIdp(settings(options));
type Client = ReturnType<typeof client>;

const MARKER = "__Secure-nextidp.signed-out";
const MARKER_SET = `${MARKER}=1; Path=/auth; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`;
const MARKER_CLEARED = `${MARKER}=; Path=/auth; Max-Age=0; HttpOnly; SameSite=Lax; Secure`;

/** GET <basePath>/login with this query, as `browser`: the answer, its authorize URL's parameters. */
async function login(auth: Client, browser: Browser, query = "", base = APP_URL) {
  const response = browser.take(await auth.handler(browser.get(`${base}/auth/login${query}`)));
  const location = response.headers.get("location") ?? "";
  return {
    response,
    params: new URL(location).searchParams,
    cookies: response.headers.getSetCookie(),
  };
}

async function signIn(auth: Client, browser: Browser, base = APP_URL) {
  const { params, response } = await login(auth, browser, "", base);
  const code = issuer.issueCode(response.headers.get("location") ?? "");
  const callback = `${base}/auth/callback?${new URLSearchParams({ code, state: params.get("state") ?? "" })}`;
  browser.take(await auth.handler(browser.get(callback)));
}

async function signOut(auth: Client, browser: Browser, base = APP_URL) {
  const response = browser.take(await auth.handler(browser.post(`${base}/auth/logout`, {}, base)));
  expect(response.status).toBe(303);
  return response.headers.getSetCookie();
}

describe("prompt on the sign-in link", () => {
  it("sends none by default", async () => {
    const { params } = await login(client(), new Browser());
    expect(params.has("prompt")).toBe(false);
  });

  it.each(["login", "consent", "select_account", "login consent"])(
    "passes %j on",
    async (value) => {
      const { params } = await login(
        client(),
        new Browser(),
        `?${new URLSearchParams({ prompt: value })}`,
      );
      expect(params.get("prompt")).toBe(value);
    },
  );

  it("sends each value once", async () => {
    const { params } = await login(client(), new Browser(), "?prompt=login+login");
    expect(params.get("prompt")).toBe("login");
  });

  it.each(["none", "create", "LOGIN", "login none", "login\tconsent", " ", ""])(
    "leaves out %j: not every value is allowed",
    async (value) => {
      const { params, response } = await login(
        client(),
        new Browser(),
        `?${new URLSearchParams({ prompt: value })}`,
      );
      expect(response.status).toBe(302);
      expect(params.has("prompt")).toBe(false);
    },
  );

  it("passes nothing else from the query to the auth server", async () => {
    const { params } = await login(
      client(),
      new Browser(),
      `?${new URLSearchParams({
        prompt: "consent",
        max_age: "0",
        login_hint: "someone@example.test",
        acr_values: "mfa",
        ui_locales: "fr",
        redirect_uri: "https://evil.example.test/",
        returnTo: "/settings",
      })}`,
    );
    expect([...params.keys()].sort()).toEqual(
      [
        "client_id",
        "code_challenge",
        "code_challenge_method",
        "nonce",
        "prompt",
        "redirect_uri",
        "response_type",
        "scope",
        "state",
      ].sort(),
    );
    expect(params.get("redirect_uri")).toBe(`${APP_URL}/auth/callback`);
  });

  it("is in the links signInPath builds, and only when allowed", () => {
    const auth = client();
    expect(auth.signInPath()).toBe("/auth/login");
    expect(auth.signInPath("/x")).toBe("/auth/login?returnTo=%2Fx");
    expect(auth.signInPath("/x", { prompt: "consent" })).toBe(
      "/auth/login?returnTo=%2Fx&prompt=consent",
    );
    expect(auth.signInPath(undefined, { prompt: "none" })).toBe("/auth/login");
    expect(auth.signInPath("/x", { reauthenticate: false })).toBe(
      "/auth/login?returnTo=%2Fx&reauthenticate=false",
    );
    expect(auth.signInPath(undefined, { reauthenticate: true })).toBe("/auth/login");
  });
});

describe("asking for the password again after a sign-out", () => {
  it("is off by default: no marker, no prompt", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const cookies = await signOut(auth, browser);
    expect(cookies.some((cookie) => cookie.includes("signed-out"))).toBe(false);
    expect((await login(auth, browser)).params.has("prompt")).toBe(false);
  });

  it("marks the sign-out, asks for prompt=login once, and clears the mark", async () => {
    const auth = client({ reauthenticateAfterSignOut: true });
    const browser = new Browser();
    await signIn(auth, browser);
    expect(await signOut(auth, browser)).toContain(MARKER_SET);
    expect(browser.cookies.get(MARKER)).toBe("1");

    const first = await login(auth, browser);
    expect(first.params.get("prompt")).toBe("login");
    expect(first.cookies).toContain(MARKER_CLEARED);
    // The flow cookie is set as usual beside it.
    expect(first.cookies.some((cookie) => cookie.startsWith("__Host-nextidp.flow="))).toBe(true);
    expect(browser.cookies.has(MARKER)).toBe(false);

    const second = await login(auth, browser);
    expect(second.params.has("prompt")).toBe(false);
    expect(second.cookies.some((cookie) => cookie.includes("signed-out"))).toBe(false);
  });

  it("marks a sign-out of the auth server too", async () => {
    const auth = client({ reauthenticateAfterSignOut: true, signOutOfIdp: true });
    const browser = new Browser();
    await signIn(auth, browser);
    const response = browser.take(await auth.handler(browser.post(`${APP_URL}/auth/logout`)));
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/auth\.example\.test\/end-session\?/,
    );
    expect(response.headers.getSetCookie()).toContain(MARKER_SET);
  });

  it("marks a sign-out without a session", async () => {
    const auth = client({ reauthenticateAfterSignOut: true });
    expect(await signOut(auth, new Browser())).toContain(MARKER_SET);
  });

  it("leaves the mark for later when the link opts out (reauthenticate=false)", async () => {
    const auth = client({ reauthenticateAfterSignOut: true });
    const browser = new Browser();
    await signOut(auth, browser);

    const signUp = await login(auth, browser, "?reauthenticate=false");
    expect(signUp.params.has("prompt")).toBe(false);
    expect(signUp.cookies.some((cookie) => cookie.includes("signed-out"))).toBe(false);
    expect(browser.cookies.get(MARKER)).toBe("1");

    expect((await login(auth, browser)).params.get("prompt")).toBe("login");
  });

  it("lets an explicit prompt win: consent keeps the mark, login uses it up", async () => {
    const auth = client({ reauthenticateAfterSignOut: true });
    const browser = new Browser();
    await signOut(auth, browser);

    const consent = await login(auth, browser, "?prompt=consent");
    expect(consent.params.get("prompt")).toBe("consent");
    expect(browser.cookies.get(MARKER)).toBe("1");

    const loginAgain = await login(auth, browser, "?prompt=login");
    expect(loginAgain.params.get("prompt")).toBe("login");
    expect(loginAgain.cookies).toContain(MARKER_CLEARED);
  });

  it("ignores and clears a mark left from when the option was on", async () => {
    const browser = new Browser();
    await signOut(client({ reauthenticateAfterSignOut: true }), browser);
    const off = await login(client(), browser);
    expect(off.params.has("prompt")).toBe(false);
    expect(off.cookies).toContain(MARKER_CLEARED);
  });

  it("over http: no __Secure- name and no Secure", async () => {
    const http = "http://localhost:3001";
    const auth = client({ reauthenticateAfterSignOut: true, appUrl: http });
    const browser = new Browser();
    expect(await signOut(auth, browser, http)).toContain(
      "nextidp.signed-out=1; Path=/auth; Max-Age=2592000; HttpOnly; SameSite=Lax",
    );
    const next = await login(auth, browser, "", http);
    expect(next.params.get("prompt")).toBe("login");
    expect(next.cookies).toContain(
      "nextidp.signed-out=; Path=/auth; Max-Age=0; HttpOnly; SameSite=Lax",
    );
  });

  it("is scoped to basePath, under the cookie prefix", async () => {
    const auth = client({
      reauthenticateAfterSignOut: true,
      basePath: "/oidc",
      cookiePrefix: "shop",
    });
    const response = await auth.handler(new Browser().post(`${APP_URL}/oidc/logout`));
    expect(response.headers.getSetCookie()).toContain(
      "__Secure-shop.signed-out=1; Path=/oidc; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure",
    );
  });

  it("works the same through an adapter (Hono)", async () => {
    const auth = honoIdp(settings({ reauthenticateAfterSignOut: true }));
    const app = new Hono();
    app.all("/auth/*", auth.routes());
    const browser = new Browser();
    const out = browser.take(
      await app.request(`${APP_URL}/auth/logout`, {
        method: "POST",
        headers: { origin: APP_URL, "content-type": "application/x-www-form-urlencoded" },
        body: "",
      }),
    );
    expect(out.headers.getSetCookie()).toContain(MARKER_SET);
    const next = browser.take(
      await app.request(`${APP_URL}/auth/login`, { headers: { cookie: browser.header } }),
    );
    expect(new URL(next.headers.get("location") ?? "").searchParams.get("prompt")).toBe("login");
    expect(next.headers.getSetCookie()).toContain(MARKER_CLEARED);
  });
});
