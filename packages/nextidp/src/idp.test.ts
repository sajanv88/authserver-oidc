// The whole flow against a fake auth server: sign in, the callback's checks, the session,
// refresh, sign-out (here and at the auth server).
import { createHash } from "node:crypto";
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

function client(options: IdpOptions = {}) {
  return createIdp({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    appUrl: APP_URL,
    secret: SECRET,
    afterSignIn: "/dashboard",
    env: {},
    onError: (error) => errors.push(error),
    ...options,
  });
}

/** Signs in through the handler, as a browser would, and returns the callback's answer. */
async function signIn(auth: ReturnType<typeof client>, browser: Browser, returnTo?: string) {
  const query = returnTo ? `?${new URLSearchParams({ returnTo })}` : "";
  const login = browser.take(await auth.handler(browser.get(`${APP_URL}/auth/login${query}`)));
  const authorize = login.headers.get("location") ?? "";
  const params = new URL(authorize).searchParams;
  const code = issuer.issueCode(authorize);
  const callback = new URL(`${APP_URL}/auth/callback`);
  callback.search = new URLSearchParams({ code, state: params.get("state") ?? "" }).toString();
  return browser.take(await auth.handler(browser.get(callback.toString())));
}

describe("signing in", () => {
  it("sends the browser to authorize with PKCE S256, a state and a nonce", async () => {
    const auth = client({ resource: "https://api.example.test" });
    const response = await auth.handler(new Request(`${APP_URL}/auth/login`));
    expect(response.status).toBe(302);
    const authorize = new URL(response.headers.get("location") ?? "");
    expect(`${authorize.origin}${authorize.pathname}`).toBe(`${ISSUER}/authorize`);
    const params = Object.fromEntries(authorize.searchParams);
    expect(params).toMatchObject({
      response_type: "code",
      client_id: CLIENT_ID,
      redirect_uri: `${APP_URL}/auth/callback`,
      scope: "openid profile email offline_access",
      code_challenge_method: "S256",
      resource: "https://api.example.test",
    });
    expect(params.state).toMatch(/^[\w-]{43}$/);
    expect(params.nonce).toMatch(/^[\w-]{43}$/);
    expect(params.code_challenge).toMatch(/^[\w-]{43}$/);
    const [flow] = response.headers.getSetCookie();
    expect(flow).toMatch(
      /^__Host-nextidp\.flow=.+; Path=\/; Max-Age=600; HttpOnly; SameSite=Lax; Secure$/,
    );
  });

  it("finishes: the code for tokens, the ID token checked, a session, back where it started", async () => {
    const auth = client();
    const browser = new Browser();
    const done = await signIn(auth, browser, "/reports?year=2026");
    expect(done.status).toBe(302);
    expect(done.headers.get("location")).toBe(`${APP_URL}/reports?year=2026`);
    // The sign-in cookie is used up; the session cookie is set.
    expect([...browser.cookies.keys()]).toEqual(["__Host-nextidp.session"]);

    const session = await auth.getSession(browser.header);
    expect(session?.user).toEqual({ id: "user-1", email: "user-1@example.test", name: "Pat" });
    expect(session?.canRefresh).toBe(true);
    expect(session?.accessTokenExpiresAt).toBeGreaterThan(Date.now() / 1000 + 500);

    // A public client names itself; the verifier matches the challenge sent to authorize.
    const [exchange] = issuer.calls("/token");
    const form = new URLSearchParams(exchange?.body);
    expect(form.get("client_id")).toBe(CLIENT_ID);
    expect(exchange?.headers.get("authorization")).toBeNull();
  });

  it("lands on afterSignIn without a returnTo, and ignores one that leaves the app", async () => {
    const auth = client();
    expect((await signIn(auth, new Browser())).headers.get("location")).toBe(
      `${APP_URL}/dashboard`,
    );
    for (const away of ["https://evil.example/", "//evil.example", "/\\evil.example"]) {
      const done = await signIn(auth, new Browser(), away);
      expect(done.headers.get("location")).toBe(`${APP_URL}/dashboard`);
    }
  });

  it("authenticates a confidential client with Basic, and not in the body", async () => {
    await signIn(client({ clientSecret: "s3cr:et" }), new Browser());
    const [exchange] = issuer.calls("/token");
    const expected = Buffer.from(`${CLIENT_ID}:${encodeURIComponent("s3cr:et")}`).toString(
      "base64",
    );
    expect(exchange?.headers.get("authorization")).toBe(`Basic ${expected}`);
    expect(new URLSearchParams(exchange?.body).get("client_id")).toBeNull();
  });

  it("redeems the code with the verifier whose SHA-256 is the challenge it sent", async () => {
    const auth = client();
    const browser = new Browser();
    const login = browser.take(await auth.handler(browser.get(`${APP_URL}/auth/login`)));
    const authorize = new URL(login.headers.get("location") ?? "");
    const callback = new URL(`${APP_URL}/auth/callback`);
    callback.search = new URLSearchParams({
      code: issuer.issueCode(authorize.toString()),
      state: authorize.searchParams.get("state") ?? "",
    }).toString();
    browser.take(await auth.handler(browser.get(callback.toString())));
    const verifier =
      new URLSearchParams(issuer.calls("/token").at(-1)?.body).get("code_verifier") ?? "";
    // Computed by Node, independently of nextidp's own code.
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
      authorize.searchParams.get("code_challenge"),
    );
    expect(verifier).toMatch(/^[\w-]{43}$/);
  });
});

describe("the callback refuses", () => {
  async function started(auth: ReturnType<typeof client>) {
    const browser = new Browser();
    const login = browser.take(await auth.handler(browser.get(`${APP_URL}/auth/login`)));
    const authorize = login.headers.get("location") ?? "";
    return { browser, authorize, state: new URL(authorize).searchParams.get("state") ?? "" };
  }

  const callbackUrl = (params: Record<string, string>) =>
    `${APP_URL}/auth/callback?${new URLSearchParams(params)}`;

  it("an answer without this browser's sign-in cookie: expired", async () => {
    const auth = client();
    const { authorize, state } = await started(auth);
    const response = await auth.handler(
      new Request(callbackUrl({ code: issuer.issueCode(authorize), state })),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=expired`);
  });

  it("another state: state_mismatch, and the sign-in cookie is cleared", async () => {
    const auth = client();
    const { browser, authorize } = await started(auth);
    const response = browser.take(
      await auth.handler(
        browser.get(callbackUrl({ code: issuer.issueCode(authorize), state: "x" })),
      ),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=state_mismatch`);
    expect(browser.cookies.size).toBe(0);
  });

  it("Deny on the auth server: access_denied, to errorPath", async () => {
    const auth = client({ errorPath: "/signed-out?from=idp" });
    const { browser, state } = await started(auth);
    const response = await auth.handler(
      browser.get(callbackUrl({ error: "access_denied", state })),
    );
    expect(response.headers.get("location")).toBe(
      `${APP_URL}/signed-out?from=idp&error=access_denied`,
    );
  });

  it("a refused code: token_failed, without the server's description", async () => {
    const auth = client();
    const { browser, authorize, state } = await started(auth);
    issuer.settings.tokenFailure = { status: 400, error: "invalid_grant" };
    const response = await auth.handler(
      browser.get(callbackUrl({ code: issuer.issueCode(authorize), state })),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=token_failed`);
    expect(errors.map((e) => [e.code, e.status, e.message])).toEqual([
      ["token_failed", 400, "The token endpoint refused: invalid_grant."],
    ]);
  });

  it("an ID token signed with another key: invalid_id_token, no session", async () => {
    const auth = client();
    const { browser, authorize, state } = await started(auth);
    issuer.settings.forge = true;
    const response = browser.take(
      await auth.handler(browser.get(callbackUrl({ code: issuer.issueCode(authorize), state }))),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=invalid_id_token`);
    expect(await auth.getSession(browser.header)).toBeNull();
  });

  it("an ID token issued to another party: invalid_id_token", async () => {
    const auth = client();
    const { browser, authorize, state } = await started(auth);
    issuer.settings.extraClaims = { azp: "someone-else" };
    const response = await auth.handler(
      browser.get(callbackUrl({ code: issuer.issueCode(authorize), state })),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=invalid_id_token`);
  });

  it("an ID token with another sign-in's nonce: invalid_id_token", async () => {
    const auth = client();
    const first = await started(auth);
    const second = await started(auth);
    // The first sign-in's code (so PKCE passes), but its ID token carries the second's nonce.
    const nonce = new URL(second.authorize).searchParams.get("nonce") ?? "";
    const code = issuer.issueCode(first.authorize, "user-1", { nonce });
    const response = await auth.handler(
      first.browser.get(callbackUrl({ code, state: first.state })),
    );
    expect(response.headers.get("location")).toBe(`${APP_URL}/?error=invalid_id_token`);
  });
});

describe("the session", () => {
  it("is null without a cookie, with someone else's secret, or with an altered one", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    expect(await auth.getSession(null)).toBeNull();
    expect(
      await client({ secret: "another secret, also thirty-two characters" }).getSession(
        browser.header,
      ),
    ).toBeNull();
    const value = browser.cookies.get("__Host-nextidp.session") ?? "";
    expect(await auth.getSession(`__Host-nextidp.session=${value.slice(0, -3)}AAA`)).toBeNull();
  });

  it("survives a secret rotation: the old secret, second in the list, still opens it", async () => {
    const browser = new Browser();
    await signIn(client(), browser);
    const rotated = client({ secret: ["the new secret, thirty-two characters or more", SECRET] });
    expect((await rotated.getSession(browser.header))?.user.id).toBe("user-1");
  });

  it("is split across cookies when it's too big for one, and read back whole", async () => {
    const auth = client();
    const browser = new Browser();
    issuer.settings.extraClaims = { groups: Array.from({ length: 300 }, (_, i) => `group-${i}`) };
    await signIn(auth, browser);
    const names = [...browser.cookies.keys()].sort();
    expect(names.length).toBeGreaterThan(1);
    expect(names).toEqual(names.map((_, index) => `__Host-nextidp.session.${index}`));
    for (const value of browser.cookies.values()) expect(value.length).toBeLessThanOrEqual(3800);
    expect((await auth.getSession(browser.header))?.claims.groups).toHaveLength(300);
  });
});

describe("refreshing", () => {
  it("POST /refresh rotates the refresh token and returns to returnTo", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const before = await auth.getSession(browser.header);
    const response = browser.take(
      await auth.handler(browser.post(`${APP_URL}/auth/refresh`, { returnTo: "/me?refreshed=1" })),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_URL}/me?refreshed=1`);
    const after = await auth.getSession(browser.header);
    expect(after?.accessToken).not.toBe(before?.accessToken);
    // The claims are kept when the server sends no new ID token.
    expect(after?.user).toEqual(before?.user);
    expect(issuer.refreshTokens.size).toBe(1);
  });

  it("refuses a POST from another site", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    for (const path of ["/auth/refresh", "/auth/logout"]) {
      const response = await auth.handler(
        browser.post(`${APP_URL}${path}`, {}, "https://evil.example"),
      );
      expect(response.status).toBe(403);
    }
  });

  it("refuses a new ID token for someone else, and ends the session on a refusal", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    issuer.settings.refreshIdTokenSub = "user-2";
    const swapped = await auth.handler(browser.post(`${APP_URL}/auth/refresh`));
    expect(swapped.headers.get("location")).toBe(`${APP_URL}/?error=refresh_failed`);
    issuer.settings.refreshIdTokenSub = undefined;
    issuer.refreshTokens.clear();
    const refused = browser.take(await auth.handler(browser.post(`${APP_URL}/auth/refresh`)));
    expect(refused.headers.get("location")).toBe(`${APP_URL}/?error=refresh_failed`);
    expect(await auth.getSession(browser.header)).toBeNull();
  });

  it("refreshIfNeeded leaves a fresh token alone and refreshes one about to expire", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const fresh = await auth.refreshIfNeeded(browser.header);
    expect(fresh.setCookies).toEqual([]);
    expect(fresh.cookieHeader).toBeUndefined();

    const soon = await auth.refreshIfNeeded(browser.header, { leeway: 3600 });
    expect(soon.session?.accessToken).not.toBe(fresh.session?.accessToken);
    expect(soon.setCookies).toHaveLength(1);
    // What the rest of the request should see: the new session in place of the old one.
    expect(await auth.getSession(soon.cookieHeader)).toEqual(soon.session);
  });

  it("shares one refresh between requests that carry the same refresh token", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const results = await Promise.all(
      [1, 2, 3].map(() => auth.refreshIfNeeded(browser.header, { leeway: 3600 })),
    );
    expect(issuer.calls("/token").filter((r) => r.body.includes("refresh_token"))).toHaveLength(1);
    expect(new Set(results.map((r) => r.session?.accessToken)).size).toBe(1);
  });

  it("keeps the session when the auth server is down, and ends it when it refuses", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    issuer.settings.tokenFailure = { status: 503, error: "temporarily_unavailable" };
    const down = await auth.refreshIfNeeded(browser.header, { leeway: 3600 });
    expect(down.session?.user.id).toBe("user-1");
    expect(down.setCookies).toEqual([]);
    issuer.settings.tokenFailure = { status: 400, error: "invalid_grant" };
    const refused = await auth.refreshIfNeeded(browser.header, { leeway: 3600 });
    expect(refused.session).toBeNull();
    expect(refused.setCookies).toEqual([
      "__Host-nextidp.session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    ]);
  });
});

describe("signing out", () => {
  it("revokes the refresh token, clears the session and goes to afterSignOut", async () => {
    const auth = client({ afterSignOut: "/bye" });
    const browser = new Browser();
    await signIn(auth, browser);
    const response = browser.take(await auth.handler(browser.post(`${APP_URL}/auth/logout`)));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP_URL}/bye`);
    expect(browser.cookies.size).toBe(0);
    expect(issuer.calls("/revoke")).toHaveLength(1);
    expect(issuer.refreshTokens.size).toBe(0);
  });

  it("signs out of the auth server too when the form asks, with the ID token as the hint", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const response = await auth.handler(
      browser.post(`${APP_URL}/auth/logout`, { signOutOfIdp: "true" }),
    );
    const end = new URL(response.headers.get("location") ?? "");
    expect(`${end.origin}${end.pathname}`).toBe(`${ISSUER}/end-session`);
    expect(end.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(end.searchParams.get("post_logout_redirect_uri")).toBe(`${APP_URL}/`);
    expect(end.searchParams.get("id_token_hint")?.split(".")).toHaveLength(3);
  });

  it("follows signOutOfIdp by default, and a form field that says false wins", async () => {
    const auth = client({ signOutOfIdp: true });
    const browser = new Browser();
    await signIn(auth, browser);
    const local = await auth.handler(
      browser.post(`${APP_URL}/auth/logout`, { signOutOfIdp: "false" }),
    );
    expect(local.headers.get("location")).toBe(`${APP_URL}/`);
  });
});

describe("the routes", () => {
  it("answer 405 to the wrong method and 404 to anything else under basePath", async () => {
    const auth = client({ basePath: "/oidc" });
    expect((await auth.handler(new Request(`${APP_URL}/oidc/logout`))).status).toBe(405);
    expect((await auth.handler(new Request(`${APP_URL}/oidc/nope`))).status).toBe(404);
    expect((await auth.handler(new Request(`${APP_URL}/auth/login`))).status).toBe(404);
    expect(auth.signInPath("/x?y=1")).toBe("/oidc/login?returnTo=%2Fx%3Fy%3D1");
    expect(auth.signInPath("https://evil.example")).toBe("/oidc/login");
  });

  it("answer 500 and log the settings that are wrong", async () => {
    const auth = createIdp({ env: {}, onError: (error) => errors.push(error) });
    expect((await auth.handler(new Request(`${APP_URL}/auth/login`))).status).toBe(500);
    expect(errors[0]?.code).toBe("misconfigured");
  });

  it("read the settings from a function only when first used", async () => {
    const read = vi.fn(() => ({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      appUrl: APP_URL,
      secret: SECRET,
      env: {},
    }));
    const auth = createIdp(read);
    expect(read).not.toHaveBeenCalled();
    expect(auth.config().redirectUri).toBe(`${APP_URL}/auth/callback`);
    auth.config();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("fetch userinfo with the access token", async () => {
    const auth = client();
    const browser = new Browser();
    await signIn(auth, browser);
    const session = await auth.getSession(browser.header);
    expect(await auth.userInfo(session?.accessToken ?? "")).toEqual({
      sub: "user-1",
      email: "user-1@example.test",
    });
    await expect(auth.userInfo("")).rejects.toMatchObject({ code: "userinfo_failed", status: 401 });
  });
});
