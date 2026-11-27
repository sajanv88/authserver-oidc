// The `userinfo` option: the email, name and picture from userinfo, merged into the session
// at sign-in and when a refresh brings a new ID token, best effort, for the same subject only.
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
import { memoryStore } from "./store.js";

let issuer: FakeIssuer;
let errors: IdpError[];

async function useIssuer(options: Parameters<typeof fakeIssuer>[0] = {}) {
  issuer = await fakeIssuer(options);
  vi.stubGlobal("fetch", issuer.fetch);
}

beforeEach(async () => {
  await useIssuer();
  // As Next-Identity Server does: the ID token has no email or name; userinfo has them.
  issuer.settings.profileInIdToken = false;
  issuer.settings.userinfo = {
    sub: "user-1",
    email: "pat@example.test",
    email_verified: true,
    name: "Pat Doe",
    picture: "https://cdn.example.test/pat.png",
  };
  errors = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = (options: IdpOptions = {}) =>
  createIdp({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    appUrl: APP_URL,
    secret: SECRET,
    afterSignIn: "/dashboard",
    env: {},
    userinfo: true,
    onError: (error) => errors.push(error),
    ...options,
  });
type Client = ReturnType<typeof client>;

/** Signs in through the handler; the callback's answer. */
async function signIn(auth: Client, browser: Browser) {
  const login = browser.take(await auth.handler(browser.get(`${APP_URL}/auth/login`)));
  const authorize = login.headers.get("location") ?? "";
  const code = issuer.issueCode(authorize);
  const state = new URL(authorize).searchParams.get("state") ?? "";
  return browser.take(
    await auth.handler(
      browser.get(`${APP_URL}/auth/callback?${new URLSearchParams({ code, state })}`),
    ),
  );
}

/** refreshIfNeeded, with its cookies taken by the browser: the session after. */
async function refresh(auth: Client, browser: Browser) {
  const refreshed = await auth.refreshIfNeeded(browser.header);
  const headers = new Headers();
  for (const cookie of refreshed.setCookies) headers.append("set-cookie", cookie);
  browser.take(new Response(null, { headers }));
  return refreshed.session;
}

const userinfoCalls = () => issuer.calls("/userinfo", "GET").length;

describe("userinfo merged into the session", () => {
  it("is off by default: no request, the user from the ID token alone", async () => {
    const auth = client({ userinfo: undefined });
    const browser = new Browser();
    await signIn(auth, browser);
    expect((await auth.getSession(browser.header))?.user).toEqual({ id: "user-1" });
    expect(userinfoCalls()).toBe(0);
  });

  it("adds the email, its verification, the name and the picture at sign-in", async () => {
    const auth = client();
    const browser = new Browser();
    expect((await signIn(auth, browser)).headers.get("location")).toBe(`${APP_URL}/dashboard`);
    const session = await auth.getSession(browser.header);
    expect(session?.user).toEqual({
      id: "user-1",
      email: "pat@example.test",
      emailVerified: true,
      name: "Pat Doe",
      picture: "https://cdn.example.test/pat.png",
    });
    // The claims stay the ID token's.
    expect(session?.claims.email).toBeUndefined();
    expect(userinfoCalls()).toBe(1);
    expect(errors).toEqual([]);
  });

  it("wins over the ID token, and keeps an email with its own verification", async () => {
    issuer.settings.profileInIdToken = true;
    issuer.settings.extraClaims = { email_verified: true };
    issuer.settings.userinfo = { sub: "user-1", email: "new@example.test", name: "Patricia" };
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    // The ID token said user-1@example.test was verified; nothing says new@ is.
    expect((await auth.getSession(browser.header))?.user).toEqual({
      id: "user-1",
      email: "new@example.test",
      name: "Patricia",
    });
  });

  it("keeps only those fields, and none that are too long", async () => {
    issuer.settings.userinfo = {
      sub: "user-1",
      email: "pat@example.test",
      name: "x".repeat(1025),
      picture: 42,
      address: { street_address: "1 Main St" },
      phone_number: "+15555550100",
    };
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const session = await auth.getSession(browser.header);
    expect(session?.user).toEqual({ id: "user-1", email: "pat@example.test" });
    expect(session?.claims).not.toHaveProperty("address");
    expect(session?.claims).not.toHaveProperty("phone_number");
  });

  it("keeps the profile on a refresh without an ID token", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    issuer.settings.userinfo = { sub: "user-1", name: "Changed" };
    const session = await refresh(auth, browser);
    expect(session?.user.name).toBe("Pat Doe");
    expect(session?.user.email).toBe("pat@example.test");
    expect((await auth.getSession(browser.header))?.user.name).toBe("Pat Doe");
    expect(userinfoCalls()).toBe(1);
  });

  it("asks again on a refresh that brings a new ID token", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    issuer.settings.refreshIdTokenSub = "user-1";
    issuer.settings.userinfo = { sub: "user-1", email: "pat@example.test", name: "Changed" };
    const session = await refresh(auth, browser);
    expect(session?.user.name).toBe("Changed");
    expect((await auth.getSession(browser.header))?.user.name).toBe("Changed");
    expect(userinfoCalls()).toBe(2);
  });

  it("keeps the profile when userinfo fails on a refresh", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    issuer.settings.refreshIdTokenSub = "user-1";
    issuer.settings.userinfoStatus = 500;
    const session = await refresh(auth, browser);
    expect(session?.user.name).toBe("Pat Doe");
    expect(errors.map((error) => error.code)).toEqual(["userinfo_failed"]);
  });

  it("signs in anyway when userinfo fails, and reports it without tokens or claims", async () => {
    issuer.settings.profileInIdToken = true;
    issuer.settings.userinfoStatus = 500;
    const auth = client();
    const browser = new Browser();
    expect((await signIn(auth, browser)).headers.get("location")).toBe(`${APP_URL}/dashboard`);
    const session = await auth.getSession(browser.header);
    expect(session?.user).toEqual({ id: "user-1", email: "user-1@example.test", name: "Pat" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "userinfo_failed", status: 500 });
    const message = errors[0]?.message ?? "";
    expect(message).not.toContain(session?.accessToken ?? "-");
    expect(message).not.toContain("example.test");
  });

  it("signs in anyway when the auth server has no userinfo endpoint", async () => {
    await useIssuer({ userinfo: false });
    const auth = client();
    const browser = new Browser();
    expect((await signIn(auth, browser)).headers.get("location")).toBe(`${APP_URL}/dashboard`);
    expect((await auth.getSession(browser.header))?.user.id).toBe("user-1");
    expect(errors.map((error) => error.code)).toEqual(["userinfo_failed"]);
  });

  it("ignores an answer about another subject, and reports it", async () => {
    issuer.settings.userinfo = { sub: "user-2", email: "someone@example.test", name: "Sam" };
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    expect((await auth.getSession(browser.header))?.user).toEqual({ id: "user-1" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      code: "userinfo_failed",
      message: "The userinfo answer is for another subject.",
    });
  });

  it("ignores an answer with no subject", async () => {
    issuer.settings.userinfo = { email: "someone@example.test" };
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    expect((await auth.getSession(browser.header))?.user).toEqual({ id: "user-1" });
    expect(errors.map((error) => error.code)).toEqual(["userinfo_failed"]);
  });

  it("is kept in a store as in the cookie", async () => {
    issuer.settings.accessTokenLifetime = 30;
    const auth = client({ store: memoryStore() });
    const browser = new Browser();
    await signIn(auth, browser);
    expect((await auth.getSession(browser.header))?.user.email).toBe("pat@example.test");
    const session = await refresh(auth, browser);
    expect(session?.user.name).toBe("Pat Doe");
  });
});
