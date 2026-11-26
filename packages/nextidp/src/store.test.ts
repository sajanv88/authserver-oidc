// Sessions in a store, against the fake auth server: what the cookie and the store hold,
// signing out, refreshing (by two instances sharing the store), and back-channel logout.
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
import type { IdpError } from "./errors.js";
import { createIdp } from "./idp.js";
import { memoryStore, type SessionStore } from "./store.js";

let issuer: FakeIssuer;
let errors: IdpError[];

beforeEach(async () => {
  issuer = await fakeIssuer();
  vi.stubGlobal("fetch", issuer.fetch);
  errors = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A memory store that shows what it holds. */
function visibleStore() {
  const inner = memoryStore();
  const keys = new Set<string>();
  const values = new Map<string, string>();
  const store: SessionStore = {
    get: (key) => inner.get(key),
    async set(key, value, ttl) {
      keys.add(key);
      values.set(key, value);
      await inner.set(key, value, ttl);
    },
    async delete(key) {
      keys.delete(key);
      values.delete(key);
      await inner.delete(key);
    },
  };
  const sessions = () => [...keys].filter((key) => key.includes(":session:"));
  return { store, values, sessions };
}

function client(options: IdpOptions = {}) {
  return createIdp({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    appUrl: APP_URL,
    secret: SECRET,
    env: {},
    onError: (error) => errors.push(error),
    ...options,
  });
}

type Auth = ReturnType<typeof client>;

/** Signs in through the handler, as a browser would, in the auth server's session `sid`. */
async function signIn(auth: Auth, browser: Browser, sid = "idp-session-1", sub = "user-1") {
  issuer.settings.extraClaims = { sid };
  const login = browser.take(await auth.handler(browser.get(`${APP_URL}/auth/login`)));
  const authorize = login.headers.get("location") ?? "";
  const code = issuer.issueCode(authorize, sub);
  const callback = new URL(`${APP_URL}/auth/callback`);
  const state = new URL(authorize).searchParams.get("state") ?? "";
  callback.search = new URLSearchParams({ code, state }).toString();
  return browser.take(await auth.handler(browser.get(callback.toString())));
}

/** The auth server posting a logout token, as its plugin does. */
function backchannel(auth: Auth, token: string | undefined) {
  return auth.handler(
    new Request(`${APP_URL}/auth/backchannel-logout`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(token === undefined ? {} : { logout_token: token }).toString(),
    }),
  );
}

describe("sessions in a store", () => {
  it("keep only a sealed reference in the cookie, and nothing readable in the store", async () => {
    const { store, values, sessions } = visibleStore();
    const auth = client({ store });
    const browser = new Browser();
    await signIn(auth, browser);

    const session = await auth.getSession(browser.header);
    expect(session?.user.id).toBe("user-1");
    expect(sessions()).toHaveLength(1);
    const cookie = browser.cookies.get("__Host-nextidp.session") ?? "";
    expect(cookie.length).toBeLessThan(400);
    for (const held of [cookie, ...values.values()]) {
      expect(held).not.toContain(session?.accessToken);
    }
  });

  it("end at sign-out: even a copy of the cookie kept from before is signed out", async () => {
    const { store, sessions } = visibleStore();
    const auth = client({ store });
    const browser = new Browser();
    await signIn(auth, browser);
    const copy = browser.header;

    const out = await auth.handler(browser.post(`${APP_URL}/auth/logout`));
    browser.take(out);
    expect(out.status).toBe(303);
    expect(sessions()).toHaveLength(0);
    expect(await auth.getSession(copy)).toBeNull();
  });

  it("are replaced by a new sign-in in the same browser", async () => {
    const { store, sessions } = visibleStore();
    const auth = client({ store });
    const browser = new Browser();
    await signIn(auth, browser);
    const before = browser.header;
    await signIn(auth, browser);
    expect(sessions()).toHaveLength(1);
    expect(await auth.getSession(before)).toBeNull();
    expect(await auth.getSession(browser.header)).not.toBeNull();
  });

  it("refresh in the store, keeping the same reference", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const { store, sessions } = visibleStore();
    const auth = client({ store });
    const browser = new Browser();
    await signIn(auth, browser);
    const [key] = sessions();
    const before = await auth.getSession(browser.header);

    const { session } = await auth.refreshIfNeeded(browser.header);
    expect(session?.accessToken).not.toBe(before?.accessToken);
    expect(sessions()).toEqual([key]);
    // The browser's cookie, unchanged, reads the refreshed session.
    expect((await auth.getSession(browser.header))?.accessToken).toBe(session?.accessToken);
  });

  it("stay signed in when another instance refreshed first and the token was rotated", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const shared = memoryStore();
    const browser = new Browser();
    await signIn(client({ store: shared }), browser);

    // B read the session just before A refreshed it, so B holds the old refresh token.
    let stale: string | null | undefined;
    const lagging: SessionStore = {
      async get(key) {
        if (key.includes(":session:") && stale !== undefined) {
          const once = stale;
          stale = undefined;
          return once;
        }
        return shared.get(key);
      },
      set: (key, value, ttl) => shared.set(key, value, ttl),
      delete: (key) => shared.delete(key),
    };
    const sessionKey = await (async () => {
      const keys: string[] = [];
      const spy: SessionStore = {
        get: async (key) => {
          keys.push(key);
          return shared.get(key);
        },
        set: shared.set,
        delete: shared.delete,
      };
      await client({ store: spy }).getSession(browser.header);
      return keys.find((key) => key.includes(":session:")) ?? "";
    })();
    stale = await shared.get(sessionKey);

    const a = await client({ store: shared }).refreshIfNeeded(browser.header);
    expect(a.session).not.toBeNull();
    const b = await client({ store: lagging }).refreshIfNeeded(browser.header);
    expect(b.session?.accessToken).toBe(a.session?.accessToken);
    expect(b.setCookies).toEqual([]);
    expect(errors.map((error) => error.code)).toEqual(["refresh_failed"]);
  });

  it("refuse a store that isn't one", async () => {
    const auth = client({ store: { get: async () => undefined } as unknown as SessionStore });
    expect(() => auth.config()).toThrow(/store must have get, set and delete/);
  });
});

describe("back-channel logout", () => {
  it("ends the app's sessions from that auth-server session, and no other", async () => {
    const { store } = visibleStore();
    const auth = client({ store });
    const here = new Browser();
    const there = new Browser();
    await signIn(auth, here, "idp-session-1");
    await signIn(auth, there, "idp-session-2");

    const response = await backchannel(auth, await issuer.logoutToken({ sid: "idp-session-1" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await auth.getSession(here.header)).toBeNull();
    expect(await auth.getSession(there.header)).not.toBeNull();
  });

  it("ends every session of the person begun before it when it names no session", async () => {
    const { store } = visibleStore();
    const auth = client({ store });
    const first = new Browser();
    const someoneElse = new Browser();
    await signIn(auth, first, "s1", "user-1");
    await signIn(auth, someoneElse, "s2", "user-2");

    expect(
      (await backchannel(auth, await issuer.logoutToken({ sid: undefined, sub: "user-1" }))).status,
    ).toBe(200);
    expect(await auth.getSession(first.header)).toBeNull();
    expect(await auth.getSession(someoneElse.header)).not.toBeNull();

    // Signing in again afterwards works: the mark is for sessions that began before it.
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 2000 });
    try {
      const later = new Browser();
      await signIn(auth, later, "s3", "user-1");
      expect(await auth.getSession(later.header)).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["a forged signature", () => issuer.logoutToken({}, { forge: true })],
    ["another client's token", () => issuer.logoutToken({ aud: "someone-else" })],
    ["an expired token", () => issuer.logoutToken({}, { exp: "-5m" })],
    ["no logout event", () => issuer.logoutToken({ events: undefined })],
    ["a nonce (an ID token)", () => issuer.logoutToken({ nonce: "n" })],
    ["another typ", () => issuer.logoutToken({}, { typ: "at+jwt" })],
    ["no sid and no sub", () => issuer.logoutToken({ sid: undefined, sub: undefined })],
  ])("refuses %s with 400, and ends nothing", async (_name, token) => {
    const { store } = visibleStore();
    const auth = client({ store });
    const browser = new Browser();
    await signIn(auth, browser);
    const response = await backchannel(auth, await token());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(await auth.getSession(browser.header)).not.toBeNull();
    expect(errors.map((error) => error.code)).toEqual(["invalid_logout_token"]);
  });

  it("accepts a logout token without a typ", async () => {
    const auth = client({ store: memoryStore() });
    const browser = new Browser();
    await signIn(auth, browser);
    expect((await backchannel(auth, await issuer.logoutToken({}, { typ: null }))).status).toBe(200);
    expect(await auth.getSession(browser.header)).toBeNull();
  });

  it("answers 400 without a logout_token, and 405 to a GET", async () => {
    const auth = client({ store: memoryStore() });
    expect((await backchannel(auth, undefined)).status).toBe(400);
    const get = await auth.handler(new Request(`${APP_URL}/auth/backchannel-logout`));
    expect(get.status).toBe(405);
  });

  it("isn't there without a store: a cookie session can't be ended from outside", async () => {
    const auth = client();
    const response = await backchannel(auth, await issuer.logoutToken());
    expect(response.status).toBe(404);
  });

  it("keeps apps that share a store apart", async () => {
    const shared = memoryStore();
    const mine = client({ store: shared });
    const theirs = client({ store: shared, clientId: "other-client" });
    const browser = new Browser();
    await signIn(mine, browser);
    // The other app's reference can't open this app's session, nor its logout end it.
    expect(await theirs.getSession(browser.header)).toBeNull();
    await backchannel(theirs, await issuer.logoutToken({ aud: "other-client" }));
    expect(await mine.getSession(browser.header)).not.toBeNull();
  });
});
