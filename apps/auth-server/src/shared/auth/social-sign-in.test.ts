// Signing in with another account, through the real createAuth() configuration. The provider
// is the generic OpenID Connect one (SSO_*), played by a fake identity provider behind a
// stubbed fetch: discovery, keys, a token endpoint that signs real RS256 ID tokens with the
// nonce Better Auth sent, and userinfo. Google, Microsoft and GitHub go through the same
// /sign-in/social and /callback/:id endpoints.
import { createHash, randomBytes } from "node:crypto";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeUrlFrom } from "./oidc-query";
import { SSO_PROVIDER_ID } from "./social-providers";
import { refusalDestination, TWO_FACTOR_REQUIRED_ERROR } from "./social-two-factor-guard";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn, testEnv } from "./test-harness";
import { totp } from "./test-totp";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const ISSUER = "https://id.example.com";
const DISCOVERY_URL = `${ISSUER}/.well-known/openid-configuration`;
const CLIENT_ID = "auth-server";
const password = "correct horse battery staple";

/** Who the identity provider says signs in next. */
type Person = { sub: string; email: string; email_verified: boolean; name: string };

describe("signing in with another account", () => {
  const realFetch = globalThis.fetch;
  let h: Harness;
  let signingKey: CryptoKey;
  let publicJwk: JWK;
  let person: Person;
  /** The nonce Better Auth put in the last authorization URL: the ID token must carry it. */
  let nonce = "";
  let nextIp = 1;

  beforeAll(async () => {
    const keys = await generateKeyPair("RS256", { extractable: true });
    signingKey = keys.privateKey;
    publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "key-1", alg: "RS256", use: "sig" };
    h = await createHarness({
      social: {
        sso: {
          name: "Acme ID",
          discoveryUrl: DISCOVERY_URL,
          clientId: CLIENT_ID,
          clientSecret: "s",
        },
      },
    });
  });

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(ISSUER)) return realFetch(input, init);
      const path = new URL(url).pathname;
      if (path === "/.well-known/openid-configuration") {
        return Response.json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          userinfo_endpoint: `${ISSUER}/userinfo`,
          jwks_uri: `${ISSUER}/jwks`,
          id_token_signing_alg_values_supported: ["RS256"],
        });
      }
      if (path === "/jwks") return Response.json({ keys: [publicJwk] });
      if (path === "/token") {
        const idToken = await new SignJWT({ ...person, nonce })
          .setProtectedHeader({ alg: "RS256", kid: "key-1" })
          .setIssuer(ISSUER)
          .setAudience(CLIENT_ID)
          .setSubject(person.sub)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(signingKey);
        return Response.json({
          access_token: "provider-access-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: idToken,
        });
      }
      if (path === "/userinfo") return Response.json(person);
      return new Response("not found", { status: 404 });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A browser of its own, so the rate limits (10 a minute) never count across tests. */
  function freshBrowser() {
    return h.browser(`198.51.100.${nextIp++}`);
  }

  /**
   * The button's server action, then the provider sending the browser back with a code.
   * `errorCallbackURL` is what `socialTargets` gives: the login page with what it was opened
   * with; `null` leaves it out.
   */
  async function signInWithProvider(
    browser: Browser,
    oauthQuery?: string,
    errorCallbackURL: string | null = "/login",
  ) {
    const start = await browser.caller()({
      path: "/sign-in/social",
      body: {
        provider: SSO_PROVIDER_ID,
        callbackURL: "/account/security",
        ...(errorCallbackURL === null ? {} : { errorCallbackURL }),
        disableRedirect: true,
      },
      oauthQuery,
    });
    expect(start.ok).toBe(true);
    const authorizeUrl = new URL(String(start.ok && start.data.url));
    nonce = authorizeUrl.searchParams.get("nonce") ?? "";
    const state = authorizeUrl.searchParams.get("state") ?? "";
    const callback = await browser.request(
      "GET",
      `/api/auth/callback/${SSO_PROVIDER_ID}?code=provider-code&state=${encodeURIComponent(state)}`,
      // A browser's navigation, as the provider's redirect is.
      { headers: { "sec-fetch-mode": "navigate", accept: "text/html" } },
    );
    return { authorizeUrl, callback, location: callback.headers.get("location") ?? "" };
  }

  const sessionCookie = (browser: Browser) =>
    [...browser.jar.keys()].some((name) => name.includes("session_token"));

  async function userRow(email: string) {
    const { rows } = await h.sql(
      "select id, email_verified, two_factor_enabled from users where email = $1",
      [email],
    );
    return rows[0] as { id: string; email_verified: boolean } | undefined;
  }

  /** An account with a password and two-factor on, as EnableDialog turns it on: its TOTP URI. */
  async function twoFactorUser(email: string): Promise<string> {
    const owner = freshBrowser();
    await owner.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "Tess" },
    });
    await owner.request("GET", linkIn(h.emails.at(-1)));
    const enable = (await (
      await owner.request("POST", "/api/auth/two-factor/enable", { json: { password } })
    ).json()) as { totpURI: string };
    const confirm = await owner.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: totp(enable.totpURI) },
    });
    expect(confirm.status).toBe(200);
    return enable.totpURI;
  }

  let app: Promise<{ clientId: string; redirectUri: string }> | undefined;
  /** A public client for an app, made once by an admin. */
  function exampleApp() {
    app ??= (async () => {
      const admin = freshBrowser();
      await admin.request("POST", "/api/auth/sign-up/email", {
        json: { email: "root@example.com", password, name: "Root" },
      });
      await admin.request("GET", linkIn(h.emails.at(-1)));
      await h.sql("update users set role = 'admin' where email = $1", ["root@example.com"]);
      await admin.request("POST", "/api/auth/sign-in/email", {
        json: { email: "root@example.com", password },
      });
      const cookie = [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; ");
      const redirectUri = `${APP_ORIGIN}/oidc/callback`;
      const client = await h.auth.api.adminCreateOAuthClient({
        body: {
          client_name: "Example app",
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code"],
          response_types: ["code"],
          require_pkce: true,
        },
        headers: new Headers({ cookie }),
      });
      return { clientId: client.client_id, redirectUri };
    })();
    return app;
  }

  /** The app sends the browser to authorize; the server sends it on to /login, signed. */
  async function authorizeAsApp(browser: Browser) {
    const { clientId, redirectUri } = await exampleApp();
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email",
      state: "app-state",
      nonce: "app-nonce",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const login = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(login.pathname).toBe("/login");
    expect(authorizeUrlFrom(login.searchParams)).toBeTruthy();
    return { login, verifier, clientId, redirectUri };
  }

  async function accountsOf(email: string) {
    const { rows } = await h.sql(
      `select a.provider_id, a.access_token from accounts a join users u on u.id = a.user_id
       where u.email = $1 order by a.provider_id`,
      [email],
    );
    return rows as { provider_id: string; access_token: string | null }[];
  }

  it("sends the browser to the provider with PKCE (S256), a state and a nonce", async () => {
    person = { sub: "p-0", email: "zero@example.com", email_verified: true, name: "Zero" };
    const start = await freshBrowser().caller()({
      path: "/sign-in/social",
      body: { provider: SSO_PROVIDER_ID, callbackURL: "/account/security", disableRedirect: true },
    });
    const url = new URL(String(start.ok && start.data.url));
    expect(`${url.origin}${url.pathname}`).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(`${BASE_URL}/api/auth/callback/sso`);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBeTruthy();
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(["openid", "profile", "email"]);
  });

  it("creates a confirmed account and signs in, when the provider vouches for the email", async () => {
    person = { sub: "p-1", email: "grace@example.com", email_verified: true, name: "Grace" };
    const browser = freshBrowser();
    const { location } = await signInWithProvider(browser);
    expect(location).toBe("/account/security");
    expect(sessionCookie(browser)).toBe(true);
    expect((await userRow("grace@example.com"))?.email_verified).toBe(true);
    const accounts = await accountsOf("grace@example.com");
    expect(accounts.map((a) => a.provider_id)).toEqual(["sso"]);
    // Stored encrypted, never as the provider sent it.
    expect(accounts[0]?.access_token).not.toBe("provider-access-token");
  });

  it("asks a new user to confirm an email the provider hasn't verified, and starts no session", async () => {
    person = { sub: "p-2", email: "unsure@example.com", email_verified: false, name: "Unsure" };
    const before = h.emails.length;
    const browser = freshBrowser();
    const { location } = await signInWithProvider(browser);
    expect(location).toBe("/login?error=email_not_verified");
    expect(sessionCookie(browser)).toBe(false);
    expect(h.emails.length).toBe(before + 1);
    expect(h.emails.at(-1)?.to).toBe("unsure@example.com");
  });

  it("links to an existing account only when the provider has verified the email", async () => {
    const email = "linus@example.com";
    const owner = freshBrowser();
    await owner.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "Linus" },
    });
    await owner.request("GET", linkIn(h.emails.at(-1)));

    person = { sub: "p-3", email, email_verified: false, name: "Someone" };
    const refused = await signInWithProvider(freshBrowser());
    expect(refused.location).toBe("/login?error=account_not_linked");
    expect((await accountsOf(email)).map((a) => a.provider_id)).toEqual(["credential"]);

    person = { ...person, email_verified: true };
    const linked = freshBrowser();
    expect((await signInWithProvider(linked)).location).toBe("/account/security");
    expect(sessionCookie(linked)).toBe(true);
    expect((await accountsOf(email)).map((a) => a.provider_id)).toEqual(["credential", "sso"]);
  });

  it("never links to an account whose own email isn't confirmed (no takeover by early sign-up)", async () => {
    const email = "victim@example.com";
    // Someone signs up with the address first, and never confirms it.
    await freshBrowser().request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "Squatter" },
    });
    person = { sub: "p-4", email, email_verified: true, name: "Victim" };
    const { location } = await signInWithProvider(freshBrowser());
    expect(location).toBe("/login?error=account_not_linked");
    expect((await accountsOf(email)).map((a) => a.provider_id)).toEqual(["credential"]);
  });

  it("refuses an account with two-factor on, and leaves no session behind", async () => {
    person = { sub: "p-1", email: "grace@example.com", email_verified: true, name: "Grace" };
    await h.sql("update users set two_factor_enabled = true where email = $1", [
      "grace@example.com",
    ]);
    const user = await userRow("grace@example.com");
    const { rows: before } = await h.sql(
      "select count(*)::int as n from sessions where user_id = $1",
      [user?.id],
    );

    const browser = freshBrowser();
    const { location } = await signInWithProvider(browser);
    expect(location).toBe(`/login?error=${TWO_FACTOR_REQUIRED_ERROR}`);
    expect(sessionCookie(browser)).toBe(false);
    const { rows: after } = await h.sql(
      "select count(*)::int as n from sessions where user_id = $1",
      [user?.id],
    );
    expect(after).toEqual(before);
    await h.sql("update users set two_factor_enabled = false where email = $1", [
      "grace@example.com",
    ]);
  });

  it("after the refusal, in an app's flow, the password and the code go back to the app", async () => {
    const email = "tess@example.com";
    const totpURI = await twoFactorUser(email);
    const browser = freshBrowser();
    const { login, verifier, clientId, redirectUri } = await authorizeAsApp(browser);
    const signed = login.search.slice(1);

    // The social button carries the signed query in both directions (socialTargets).
    person = { sub: "p-6", email, email_verified: true, name: "Tess" };
    const { location } = await signInWithProvider(browser, signed, `/login?${signed}`);
    const back = new URL(location, BASE_URL);
    expect(back.pathname).toBe("/login");
    expect(back.searchParams.get("error")).toBe(TWO_FACTOR_REQUIRED_ERROR);
    expect(sessionCookie(browser)).toBe(false);

    // The login page takes `error` off; what's left is still the app's signed request.
    back.searchParams.delete("error");
    const carried = back.search.slice(1);
    expect(await verifyOAuthQueryParams(carried, testEnv.betterAuthSecret)).toBe(true);
    expect(back.searchParams.get("client_id")).toBe(clientId);

    // The password, then the code, as the login and two-factor pages post them.
    const first = await browser.request("POST", "/api/auth/sign-in/email", {
      json: { email, password, oauth_query: carried },
    });
    expect(await first.json()).toMatchObject({ twoFactorRedirect: true });
    const verify = await browser.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: totp(totpURI), oauth_query: carried },
    });
    const verified = (await verify.json()) as { url?: string };
    const consentUrl = new URL(verified.url ?? "", BASE_URL);
    expect(consentUrl.pathname).toBe("/consent");

    const consent = await browser.request("POST", "/api/auth/oauth2/consent", {
      json: { accept: true, oauth_query: consentUrl.search.slice(1) },
    });
    const callback = new URL(String(((await consent.json()) as { url?: string }).url));
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("state")).toBe("app-state");
    const code = callback.searchParams.get("code") ?? "";
    expect(code).not.toBe("");

    const tokens = await browser.request("POST", "/api/auth/oauth2/token", {
      form: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
      },
    });
    expect(tokens.status).toBe(200);
    expect(await tokens.json()).toMatchObject({ access_token: expect.any(String) });
  });

  it("the refusal keeps a returnTo, and is the bare login page without one", async () => {
    const email = "tess@example.com";
    person = { sub: "p-6", email, email_verified: true, name: "Tess" };
    const returnTo = new URLSearchParams({ returnTo: "/admin/users" }).toString();
    const kept = await signInWithProvider(freshBrowser(), undefined, `/login?${returnTo}`);
    expect(kept.location).toBe(`/login?${returnTo}&error=${TWO_FACTOR_REQUIRED_ERROR}`);

    // No errorCallbackURL: Better Auth's default, onAPIError's (the login page, absolute).
    const bare = await signInWithProvider(freshBrowser(), undefined, null);
    expect(bare.location).toBe(`/login?error=${TWO_FACTOR_REQUIRED_ERROR}`);
  });

  it("the refusal goes only to this server's login page", () => {
    const to = (errorURL: unknown) =>
      refusalDestination(errorURL, "/login", `${BASE_URL}/api/auth`);
    const bare = `/login?error=${TWO_FACTOR_REQUIRED_ERROR}`;
    expect(to(undefined)).toBe(bare);
    expect(to(`${BASE_URL}/login`)).toBe(bare);
    expect(to("/login?returnTo=%2Fadmin")).toBe(
      `/login?returnTo=%2Fadmin&error=${TWO_FACTOR_REQUIRED_ERROR}`,
    );
    // Another error Better Auth or someone put there is replaced, not doubled.
    expect(to("/login?error=x&error_description=y")).toBe(bare);
    for (const elsewhere of [
      "/consent?client_id=a",
      "/api/auth/error",
      "https://evil.example/login?client_id=a",
      "//evil.example/login",
      "/\\evil.example/login",
      "javascript:alert(1)",
      "not a url at all",
    ]) {
      expect(to(elsewhere)).toBe(bare);
    }
  });

  it("refuses a sign-in from a provider's ID token posted to /sign-in/social", async () => {
    person = { sub: "p-1", email: "grace@example.com", email_verified: true, name: "Grace" };
    const token = await new SignJWT({ ...person })
      .setProtectedHeader({ alg: "RS256", kid: "key-1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setSubject(person.sub)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(signingKey);
    const browser = freshBrowser();
    const response = await browser.request("POST", "/api/auth/sign-in/social", {
      json: { provider: SSO_PROVIDER_ID, idToken: { token } },
    });
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code?: string }).code).toBe("ID_TOKEN_SIGN_IN_DISABLED");
    expect(sessionCookie(browser)).toBe(false);
  });

  it("goes on with an app's authorization request after the provider", async () => {
    const browser = freshBrowser();
    const { login } = await authorizeAsApp(browser);

    person = { sub: "p-5", email: "app-user@example.com", email_verified: true, name: "App" };
    const { location } = await signInWithProvider(browser, login.search.slice(1));
    // Signed in by the provider, and on to this server's consent for the app.
    expect(new URL(location, BASE_URL).pathname).toBe("/consent");
    expect(sessionCookie(browser)).toBe(true);
  });
});

describe("signing in with GitHub, one of Better Auth's built-in providers", () => {
  const realFetch = globalThis.fetch;
  let h: Harness;
  /** Who GitHub's API says signs in next, and whether it verified their address. */
  let githubUser = { id: 4242, email: "octo@example.com", verified: false };
  let nextIp = 1;

  beforeAll(async () => {
    h = await createHarness({
      social: { github: { clientId: "github-client", clientSecret: "github-secret" } },
    });
  });

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return Response.json({
          access_token: "gh-token",
          token_type: "bearer",
          scope: "user:email",
        });
      }
      if (url === "https://api.github.com/user") {
        return Response.json({ id: githubUser.id, login: "octo", name: "Octo", email: null });
      }
      if (url === "https://api.github.com/user/emails") {
        return Response.json([
          { email: githubUser.email, primary: true, verified: githubUser.verified },
        ]);
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function signInWithGitHub() {
    const browser = h.browser(`198.51.100.${200 + nextIp++}`);
    const start = await browser.caller()({
      path: "/sign-in/social",
      body: {
        provider: "github",
        callbackURL: "/account/security",
        errorCallbackURL: "/login",
        disableRedirect: true,
      },
    });
    const state = new URL(String(start.ok && start.data.url)).searchParams.get("state") ?? "";
    const callback = await browser.request(
      "GET",
      `/api/auth/callback/github?code=gh-code&state=${encodeURIComponent(state)}`,
      { headers: { "sec-fetch-mode": "navigate", accept: "text/html" } },
    );
    const signedIn = [...browser.jar.keys()].some((name) => name.includes("session_token"));
    return { location: callback.headers.get("location") ?? "", signedIn };
  }

  it("asks for a confirmation first when GitHub hasn't verified the address", async () => {
    githubUser = { id: 4242, email: "octo@example.com", verified: false };
    const before = h.emails.length;
    expect(await signInWithGitHub()).toEqual({
      location: "/login?error=email_not_verified",
      signedIn: false,
    });
    expect(h.emails.length).toBe(before + 1);
  });

  it("signs in once GitHub has verified it", async () => {
    githubUser = { id: 5151, email: "mona@example.com", verified: true };
    expect(await signInWithGitHub()).toEqual({ location: "/account/security", signedIn: true });
  });
});
