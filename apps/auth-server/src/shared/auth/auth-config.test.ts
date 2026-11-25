// The real createAuth() configuration against a migrated PGlite database, driven over HTTP
// through Better Auth's handler. Each block uses its own client IP so rate-limit counters
// don't leak between them.
import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { withRootJwksUri } from "./discovery";
import { machineClientDefaults, oidcClientDefaults } from "./oidc-client-defaults";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "./test-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Signs up, follows the verification link, and returns a signed-in browser. */
async function verifiedUser(h: Harness, email: string, ip: string) {
  const browser = h.browser(ip);
  const before = h.emails.length;
  const signUp = await browser.request("POST", "/api/auth/sign-up/email", {
    json: { email, password, name: "Test User" },
  });
  expect(signUp.status).toBe(200);
  expect(h.emails.length).toBe(before + 1);
  const verify = await browser.request("GET", linkIn(h.emails.at(-1)));
  expect(verify.status).toBe(302);
  return browser;
}

describe("auth configuration", () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });

  describe("sign-up and sign-in", () => {
    const ip = "203.0.113.1";

    it("sends a verification email and starts no session", async () => {
      const browser = h.browser(ip);
      const response = await browser.request("POST", "/api/auth/sign-up/email", {
        json: { email: "new@example.com", password, name: "New" },
      });
      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body.token).toBeNull();
      expect(browser.jar.size).toBe(0);
      expect(h.emails.at(-1)?.to).toBe("new@example.com");
      expect(h.emails.at(-1)?.subject).toContain("Confirm your email address");
      const { rows } = await h.sql("select role from users where email = $1", ["new@example.com"]);
      expect(rows).toEqual([{ role: "user" }]);
    });

    it("never lets sign-up set the role", async () => {
      const response = await h.browser("203.0.113.90").request("POST", "/api/auth/sign-up/email", {
        json: { email: "sneaky@example.com", password, name: "Sneaky", role: "admin" },
      });
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ code: "FIELD_NOT_ALLOWED" });
      const { rows } = await h.sql("select 1 from users where email = $1", ["sneaky@example.com"]);
      expect(rows).toEqual([]);
    });

    it("answers a sign-up for an existing email exactly like a new one, and tells the owner", async () => {
      const before = h.emails.length;
      const response = await h.browser(ip).request("POST", "/api/auth/sign-up/email", {
        json: { email: "new@example.com", password, name: "Someone else" },
      });
      expect(response.status).toBe(200);
      expect((await json(response)).token).toBeNull();
      expect(h.emails.length).toBe(before + 1);
      expect(h.emails.at(-1)?.to).toBe("new@example.com");
      expect(h.emails.at(-1)?.subject).toContain("You already have an account");
      expect(h.emails.at(-1)?.text).toContain("http://auth.localtest.me:3000/forgot-password");
    });

    it("refuses a password shorter than 12 characters", async () => {
      const response = await h.browser(ip).request("POST", "/api/auth/sign-up/email", {
        json: { email: "short@example.com", password: "short-pass", name: "Short" },
      });
      expect(response.status).toBe(400);
    });

    it("refuses an unverified sign-in, and answers wrong password and unknown email alike", async () => {
      const unverified = await h.browser("203.0.113.2").request("POST", "/api/auth/sign-in/email", {
        json: { email: "new@example.com", password },
      });
      expect(unverified.status).toBe(403);

      const wrong = await h.browser("203.0.113.3").request("POST", "/api/auth/sign-in/email", {
        json: { email: "new@example.com", password: "not the right password" },
      });
      const unknown = await h.browser("203.0.113.3").request("POST", "/api/auth/sign-in/email", {
        json: { email: "nobody@example.com", password: "not the right password" },
      });
      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect((await json(wrong)).code).toBe((await json(unknown)).code);
    });

    it("signs in after verification with a shared, HttpOnly, prefixed cookie", async () => {
      const browser = await verifiedUser(h, "ada@example.com", "203.0.113.4");
      const response = await browser.request("POST", "/api/auth/sign-in/email", {
        json: { email: "ada@example.com", password },
      });
      expect(response.status).toBe(200);
      const cookie = response.headers.getSetCookie().find((c) => c.includes("session_token"));
      expect(cookie).toMatch(/^nvx-auth\.session_token=/);
      expect(cookie).toContain("Domain=.localtest.me");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
    });
  });

  describe("rate limiting", () => {
    it("blocks the 6th sign-in a minute from one client, whatever it puts in X-Forwarded-For", async () => {
      const attempt = (spoofed: string) =>
        h.auth.handler(
          new Request(`${BASE_URL}/api/auth/sign-in/email`, {
            method: "POST",
            headers: {
              origin: BASE_URL,
              "content-type": "application/json",
              // A forged hop on the left, then the real client, then the ingress.
              "x-forwarded-for": `${spoofed}, 198.51.100.7, 10.0.0.2`,
            },
            body: JSON.stringify({ email: "ada@example.com", password: "wrong password!!" }),
          }),
        );
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) statuses.push((await attempt(`192.0.2.${i}`)).status);
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);

      const otherClient = await h
        .browser("198.51.100.8")
        .request("POST", "/api/auth/sign-in/email", {
          json: { email: "ada@example.com", password: "wrong password!!" },
        });
      expect(otherClient.status).toBe(401);
    });
  });

  describe("password reset", () => {
    const ip = "203.0.113.20";

    it("answers known and unknown emails alike, and emails only the known one", async () => {
      await verifiedUser(h, "reset@example.com", "203.0.113.21");
      const before = h.emails.length;
      const unknown = await h.browser(ip).request("POST", "/api/auth/request-password-reset", {
        json: { email: "ghost@example.com", redirectTo: "/reset-password" },
      });
      const known = await h.browser(ip).request("POST", "/api/auth/request-password-reset", {
        json: { email: "reset@example.com", redirectTo: "/reset-password" },
      });
      expect([unknown.status, known.status]).toEqual([200, 200]);
      expect(await json(unknown)).toEqual(await json(known));
      expect(h.emails.length).toBe(before + 1);
      expect(h.emails.at(-1)?.to).toBe("reset@example.com");
    });

    it("resets once with the token, signs out other sessions, and refuses the token again", async () => {
      const signedIn = h.browser("203.0.113.22");
      await signedIn.request("POST", "/api/auth/sign-in/email", {
        json: { email: "reset@example.com", password },
      });
      expect(await h.auth.api.getSession({ headers: cookieHeaders(signedIn.jar) })).not.toBeNull();

      const link = await h.browser(ip).request("GET", linkIn(h.emails.at(-1)));
      const token = new URL(link.headers.get("location") ?? "", BASE_URL).searchParams.get("token");
      expect(token).toBeTruthy();

      const newPassword = "a brand new passphrase";
      const reset = await h.browser(ip).request("POST", "/api/auth/reset-password", {
        json: { token, newPassword },
      });
      expect(reset.status).toBe(200);
      const again = await h.browser(ip).request("POST", "/api/auth/reset-password", {
        json: { token, newPassword: "yet another passphrase" },
      });
      expect(again.status).toBe(400);
      expect(await h.auth.api.getSession({ headers: cookieHeaders(signedIn.jar) })).toBeNull();
    });
  });

  describe("magic link", () => {
    const ip = "203.0.113.30";

    it("emails a known user a single-use link that signs them in", async () => {
      await verifiedUser(h, "magic@example.com", "203.0.113.31");
      const before = h.emails.length;
      const browser = h.browser(ip);
      const request = await browser.request("POST", "/api/auth/sign-in/magic-link", {
        json: { email: "magic@example.com", callbackURL: "/" },
      });
      expect(request.status).toBe(200);
      expect(h.emails.length).toBe(before + 1);

      const link = linkIn(h.emails.at(-1));
      const first = await browser.request("GET", link);
      expect(first.status).toBe(302);
      expect(first.headers.get("location")).not.toContain("error");
      expect([...browser.jar.keys()]).toContain("nvx-auth.session_token");

      const second = await h.browser("203.0.113.32").request("GET", link);
      expect(second.headers.get("location")).toContain("error");
    });

    it("answers unknown emails and two-factor accounts alike, without sending anything", async () => {
      await verifiedUser(h, "guarded@example.com", "203.0.113.33");
      await h.sql("update users set two_factor_enabled = true where email = $1", [
        "guarded@example.com",
      ]);
      const before = h.emails.length;
      const unknown = await h
        .browser("203.0.113.34")
        .request("POST", "/api/auth/sign-in/magic-link", {
          json: { email: "ghost@example.com" },
        });
      const guarded = await h
        .browser("203.0.113.34")
        .request("POST", "/api/auth/sign-in/magic-link", {
          json: { email: "guarded@example.com" },
        });
      expect(await json(unknown)).toEqual(await json(guarded));
      expect(h.emails.length).toBe(before);
    });
  });

  describe("OIDC provider", () => {
    const ip = "203.0.113.40";
    let admin: Awaited<ReturnType<typeof verifiedUser>>;
    let client: { client_id: string; client_secret?: string | undefined };

    beforeAll(async () => {
      admin = await verifiedUser(h, "admin@example.com", ip);
      await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
      client = await h.auth.api.adminCreateOAuthClient({
        body: {
          client_name: "Example app",
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: "client_secret_basic",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          require_pkce: true,
        },
        headers: cookieHeaders(admin.jar),
      });
    });

    it("disables Better Auth's own /token endpoint", async () => {
      const response = await admin.request("GET", "/api/auth/token");
      expect(response.status).toBe(404);
    });

    it("publishes discovery with the origin as issuer and keys at the root /jwks", async () => {
      const config = withRootJwksUri(await h.auth.api.getOpenIdConfig());
      expect(config.issuer).toBe(BASE_URL);
      expect(config.jwks_uri).toBe(`${BASE_URL}/jwks`);
      expect(config.authorization_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/authorize`);
      expect(config.token_endpoint).toBe(`${BASE_URL}/api/auth/oauth2/token`);
      expect(config.grant_types_supported).toEqual([
        "authorization_code",
        "client_credentials",
        "refresh_token",
      ]);
      expect(config.code_challenge_methods_supported).toEqual(["S256"]);
      expect(config.scopes_supported).toEqual(["openid", "profile", "email", "offline_access"]);
    });

    it("refuses an authorization request without PKCE", async () => {
      const response = await admin.request(
        "GET",
        `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id, { withPkce: false })}`,
      );
      expect(response.headers.get("location") ?? "").not.toMatch(/[?&]code=/);
    });

    it("runs code + PKCE end to end: consent, tokens, a verified ID token, rotating refresh", async () => {
      const verifier = randomBytes(32).toString("base64url");
      const nonce = randomBytes(8).toString("hex");
      const authorize = await admin.request(
        "GET",
        `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id, { verifier, nonce })}`,
      );
      expect(authorize.status).toBe(302);
      const consentUrl = new URL(authorize.headers.get("location") ?? "", BASE_URL);
      expect(consentUrl.pathname).toBe("/consent");
      expect(consentUrl.searchParams.get("sig")).toBeTruthy();

      const consent = await admin.request("POST", "/api/auth/oauth2/consent", {
        json: { accept: true, oauth_query: consentUrl.search.slice(1) },
      });
      expect(consent.status).toBe(200);
      const callback = new URL(String((await json(consent)).url));
      expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
      expect(callback.searchParams.get("state")).toBe("state-1");
      expect(callback.searchParams.get("iss")).toBe(BASE_URL);
      const code = callback.searchParams.get("code") ?? "";

      const tokens = await tokenRequest(client, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      });
      expect(tokens.status).toBe(200);
      const body = await json(tokens);
      expect(body).toMatchObject({ token_type: expect.stringMatching(/bearer/i), expires_in: 600 });
      expect(body.refresh_token).toBeTruthy();

      const jwks = await json(await admin.request("GET", "/api/auth/jwks"));
      const { payload, protectedHeader } = await jwtVerify(
        String(body.id_token),
        createLocalJWKSet(jwks as unknown as Parameters<typeof createLocalJWKSet>[0]),
        { issuer: BASE_URL, audience: client.client_id },
      );
      expect(protectedHeader.alg).toBe("RS256");
      expect(payload.nonce).toBe(nonce);
      const { rows } = await h.sql("select id from users where email = $1", ["admin@example.com"]);
      expect(payload.sub).toBe((rows[0] as { id: string }).id);

      // Scope claims come from UserInfo when an access token is issued (OIDC Core 5.4).
      const userInfo = await h.auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/userinfo`, {
          headers: { authorization: `Bearer ${String(body.access_token)}` },
        }),
      );
      expect(userInfo.status).toBe(200);
      expect(await json(userInfo)).toMatchObject({
        sub: payload.sub,
        email: "admin@example.com",
        email_verified: true,
      });
      expect(payload.exp && payload.iat ? payload.exp - payload.iat : 0).toBe(600);

      // Refresh rotates; presenting a spent refresh token revokes the whole family.
      const first = String(body.refresh_token);
      const rotated = await tokenRequest(client, {
        grant_type: "refresh_token",
        refresh_token: first,
      });
      expect(rotated.status).toBe(200);
      const second = String((await json(rotated)).refresh_token);
      expect(second).not.toBe(first);

      const reuse = await tokenRequest(client, {
        grant_type: "refresh_token",
        refresh_token: first,
      });
      expect(reuse.status).toBe(400);
      const afterReuse = await tokenRequest(client, {
        grant_type: "refresh_token",
        refresh_token: second,
      });
      expect(afterReuse.status).toBe(400);
    });

    it("refuses the code with the wrong PKCE verifier", async () => {
      const code = await codeFor(admin, randomBytes(32).toString("base64url"));
      const response = await tokenRequest(client, {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: randomBytes(32).toString("base64url"),
      });
      expect(response.status).toBe(400);
    });

    it("treats a replayed code as theft: refused, and the tokens it issued are revoked", async () => {
      // Its own user: revoking the grant ends the session it was issued from.
      const user = await verifiedUser(h, "replay@example.com", "203.0.113.42");
      const verifier = randomBytes(32).toString("base64url");
      const code = await codeFor(user, verifier);
      const exchange = { grant_type: "authorization_code", code, redirect_uri: redirectUri };
      const first = await tokenRequest(client, { ...exchange, code_verifier: verifier });
      expect(first.status).toBe(200);
      const refreshToken = String((await json(first)).refresh_token);

      const replay = await tokenRequest(client, { ...exchange, code_verifier: verifier });
      expect(replay.status).toBe(400);
      const refresh = await tokenRequest(client, {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      expect(refresh.status).toBe(400);
    });

    /** Authorizes as this browser's user, consenting if asked, and returns the code. */
    async function codeFor(
      browser: Awaited<ReturnType<typeof verifiedUser>>,
      verifier: string,
    ): Promise<string> {
      const authorize = await browser.request(
        "GET",
        `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id, { verifier, nonce: "n" })}`,
      );
      let location = new URL(authorize.headers.get("location") ?? "", BASE_URL);
      if (location.pathname === "/consent") {
        const consent = await browser.request("POST", "/api/auth/oauth2/consent", {
          json: { accept: true, oauth_query: location.search.slice(1) },
        });
        location = new URL(String((await json(consent)).url));
      }
      const code = location.searchParams.get("code");
      if (!code) throw new Error(`no code in ${location.toString()}`);
      return code;
    }

    it("refuses to create clients for a non-admin", async () => {
      const user = await verifiedUser(h, "plain@example.com", "203.0.113.41");
      await expect(
        h.auth.api.adminCreateOAuthClient({
          body: { client_name: "Nope", redirect_uris: [redirectUri] },
          headers: cookieHeaders(user.jar),
        }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    function tokenRequest(
      credentials: { client_id: string; client_secret?: string | undefined },
      form: Record<string, string>,
    ) {
      const basic = Buffer.from(
        `${credentials.client_id}:${credentials.client_secret ?? ""}`,
      ).toString("base64");
      return h.auth.handler(
        new Request(`${BASE_URL}/api/auth/oauth2/token`, {
          method: "POST",
          headers: {
            authorization: `Basic ${basic}`,
            "content-type": "application/x-www-form-urlencoded",
            "x-forwarded-for": "198.51.100.50",
          },
          body: new URLSearchParams(form).toString(),
        }),
      );
    }
  });
});

function cookieHeaders(jar: Map<string, string>): Headers {
  return new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") });
}

function authorizeQuery(
  clientId: string,
  options: { verifier?: string; nonce?: string; withPkce?: boolean },
): URLSearchParams {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    state: "state-1",
    nonce: options.nonce ?? "nonce",
  });
  if (options.withPkce !== false) {
    const verifier = options.verifier ?? randomBytes(32).toString("base64url");
    query.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    query.set("code_challenge_method", "S256");
  }
  return query;
}

describe("Cloudflare Turnstile, when it's configured", () => {
  const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const turnstile = { siteKey: "site-key", secretKey: "secret-key" };
  // One client IP per test: the sign-in rate limit (5 a minute) counts these attempts too.
  let clientIp = "";
  let nextIp = 90;
  const realFetch = globalThis.fetch;
  let h: Harness;
  /** What Cloudflare answers next, and what it was asked. */
  let answer: () => Promise<Response>;
  let asked: Record<string, unknown>[];

  beforeAll(async () => {
    // As production: that's where the token's host is checked too.
    h = await createHarness({ turnstile, isProduction: true });
  });

  beforeEach(() => {
    clientIp = `203.0.113.${nextIp++}`;
    asked = [];
    answer = async () => Response.json({ success: true, hostname: "auth.localtest.me" });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (!url.startsWith(SITEVERIFY)) return realFetch(input, init);
      asked.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return answer();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const signIn = (headers: Record<string, string> = {}) =>
    h.browser(clientIp).request("POST", "/api/auth/sign-in/email", {
      json: { email: "nobody@example.com", password },
      headers,
    });

  it("refuses a sign-in without a token, before looking at the password", async () => {
    const response = await signIn();
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ code: "MISSING_RESPONSE" });
    expect(asked).toEqual([]);
  });

  it("asks Cloudflare with the secret, the token and the client IP, then lets it through", async () => {
    const response = await signIn({ "x-captcha-response": "good-token" });
    // Past the captcha: the endpoint itself answers (no such account).
    expect(response.status).toBe(401);
    expect(asked).toEqual([{ secret: "secret-key", response: "good-token", remoteip: clientIp }]);
  });

  it("refuses a token Cloudflare rejects, or one issued for another host", async () => {
    answer = async () => Response.json({ success: false, "error-codes": ["invalid-input"] });
    const rejected = await signIn({ "x-captcha-response": "bad-token" });
    expect(rejected.status).toBe(403);
    expect(await json(rejected)).toMatchObject({ code: "VERIFICATION_FAILED" });

    answer = async () => Response.json({ success: true, hostname: "phishing.example" });
    const elsewhere = await signIn({ "x-captcha-response": "other-site-token" });
    expect(elsewhere.status).toBe(403);
  });

  it("doesn't check the host in development, where test keys report example.com", async () => {
    const development = await createHarness({ turnstile });
    answer = async () => Response.json({ success: true, hostname: "example.com" });
    const response = await development
      .browser(clientIp)
      .request("POST", "/api/auth/sign-in/email", {
        json: { email: "nobody@example.com", password },
        headers: { "x-captcha-response": "XXXX.DUMMY.TOKEN.XXXX" },
      });
    expect(response.status).toBe(401);
  });

  it("refuses when Cloudflare can't be reached", async () => {
    answer = async () => {
      throw new TypeError("fetch failed");
    };
    const response = await signIn({ "x-captcha-response": "good-token" });
    expect(response.status).toBe(500);
  });

  it("guards every endpoint a form posts to, and nothing else", async () => {
    const browser = h.browser(clientIp);
    for (const path of ["/sign-up/email", "/request-password-reset", "/sign-in/magic-link"]) {
      const response = await browser.request("POST", `/api/auth${path}`, {
        json: { email: "nobody@example.com", password, name: "Nobody", redirectTo: "/" },
      });
      expect(response.status, path).toBe(400);
    }
    const session = await browser.request("GET", "/api/auth/get-session");
    expect(session.status).toBe(200);
  });

  it("passes a server action's token on as X-Captcha-Response", async () => {
    const result = await h.browser(clientIp).caller()({
      path: "/sign-in/email",
      body: { email: "nobody@example.com", password },
      captcha: "good-token",
    });
    expect(result.status).toBe(401);
    expect(asked.map((body) => body.response)).toEqual(["good-token"]);
  });
});

describe("APIs: resources, API scopes, client credentials, back-channel logout", () => {
  const api = "https://api.localtest.me";
  const ip = "203.0.113.60";
  const zoneRedirect = `${APP_ORIGIN}/api/auth/callback`;
  // https (or loopback): the plugin refuses http for back-channel logout, in development too.
  const logoutUri = "https://app.localtest.me/api/auth/backchannel-logout";
  let h: Harness;
  let user: Awaited<ReturnType<typeof verifiedUser>>;
  let userId: string;
  let zone: { client_id: string; client_secret?: string | undefined };
  let unlinked: { client_id: string; client_secret?: string | undefined };
  let machine: { client_id: string; client_secret?: string | undefined };

  beforeAll(async () => {
    h = await createHarness({ oauth: { resources: [api], apiScopes: ["crm", "booking"] } });
    const admin = await verifiedUser(h, "admin@example.com", ip);
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    const adminHeaders = cookieHeaders(admin.jar);
    user = await verifiedUser(h, "zone-user@example.com", "203.0.113.61");
    const { rows } = await h.sql("select id from users where email = $1", [
      "zone-user@example.com",
    ]);
    userId = (rows[0] as { id: string }).id;

    // A platform zone: first-party (no consent screen), linked to the API, told of sign-outs.
    zone = await h.auth.api.adminCreateOAuthClient({
      headers: adminHeaders,
      body: {
        ...oidcClientDefaults(["crm"]),
        client_name: "Platform web",
        redirect_uris: [zoneRedirect],
        token_endpoint_auth_method: "client_secret_basic",
        skip_consent: true,
        backchannel_logout_uri: logoutUri,
        resources: [api],
      },
    });
    unlinked = await h.auth.api.adminCreateOAuthClient({
      headers: adminHeaders,
      body: {
        ...oidcClientDefaults(["crm"]),
        client_name: "Not linked",
        redirect_uris: [zoneRedirect],
        token_endpoint_auth_method: "client_secret_basic",
        skip_consent: true,
      },
    });
    machine = await h.auth.api.adminCreateOAuthClient({
      headers: adminHeaders,
      body: { ...machineClientDefaults(["crm"]), client_name: "Platform jobs", resources: [api] },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function keys() {
    const jwks = await json(await user.request("GET", "/api/auth/jwks"));
    return createLocalJWKSet(jwks as unknown as Parameters<typeof createLocalJWKSet>[0]);
  }

  function token(
    credentials: { client_id: string; client_secret?: string | undefined },
    form: Record<string, string>,
  ) {
    const basic = Buffer.from(
      `${credentials.client_id}:${credentials.client_secret ?? ""}`,
    ).toString("base64");
    return h.auth.handler(
      new Request(`${BASE_URL}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "198.51.100.60",
        },
        body: new URLSearchParams(form).toString(),
      }),
    );
  }

  /** Signs the user in to a zone, for `scope` and the API; returns the token response. */
  async function signInToZone(
    client: { client_id: string; client_secret?: string | undefined },
    scope: string,
    options: { resourceAtAuthorize?: boolean } = {},
  ) {
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: zoneRedirect,
      scope,
      state: "s",
      nonce: "n",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    if (options.resourceAtAuthorize !== false) query.set("resource", api);
    const authorize = await user.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const location = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    return {
      location,
      response: await token(client, {
        grant_type: "authorization_code",
        code: location.searchParams.get("code") ?? "",
        redirect_uri: zoneRedirect,
        code_verifier: verifier,
        resource: api,
      }),
    };
  }

  it("publishes the API scopes, client credentials and back-channel logout in discovery", async () => {
    const config = await h.auth.api.getOpenIdConfig();
    expect(config.scopes_supported).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "crm",
      "booking",
    ]);
    expect(config.grant_types_supported).toContain("client_credentials");
    expect(config.backchannel_logout_supported).toBe(true);
  });

  it("signs a first-party zone in without a consent screen, with a JWT for the API", async () => {
    const { location, response } = await signInToZone(zone, "openid email crm");
    expect(`${location.origin}${location.pathname}`).toBe(zoneRedirect);
    expect(response.status).toBe(200);
    const body = await json(response);

    const { payload, protectedHeader } = await jwtVerify(String(body.access_token), await keys(), {
      issuer: BASE_URL,
      audience: api,
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload.sub).toBe(userId);
    expect(String(payload.scope).split(" ")).toEqual(expect.arrayContaining(["openid", "crm"]));
    expect(payload.exp && payload.iat ? payload.exp - payload.iat : 0).toBe(600);
  });

  it("refuses the API to a client an admin didn't link to it", async () => {
    const { location } = await signInToZone(unlinked, "openid crm");
    expect(`${location.origin}${location.pathname}`).toBe(zoneRedirect);
    expect(location.searchParams.get("error")).toBe("invalid_target");
    expect(location.searchParams.get("code")).toBeNull();

    // Asked for only at the token endpoint (RFC 8707 allows either): refused there too.
    const signIn = await signInToZone(unlinked, "openid crm", { resourceAtAuthorize: false });
    expect(signIn.location.searchParams.get("code")).toBeTruthy();
    expect(signIn.response.status).toBe(400);
    expect(await json(signIn.response)).toMatchObject({ error: "invalid_target" });
  });

  it("refuses a scope the client wasn't registered for", async () => {
    const { location } = await signInToZone(zone, "openid booking");
    expect(location.searchParams.get("error")).toBe("invalid_scope");
  });

  it("gives a service a JWT for the API through client credentials, within its scopes", async () => {
    const granted = await token(machine, {
      grant_type: "client_credentials",
      scope: "crm",
      resource: api,
    });
    expect(granted.status).toBe(200);
    const body = await json(granted);
    expect(body.refresh_token).toBeUndefined();
    const { payload } = await jwtVerify(String(body.access_token), await keys(), {
      issuer: BASE_URL,
      audience: api,
    });
    expect(payload.scope).toBe("crm");
    expect(payload.client_id ?? payload.azp).toBe(machine.client_id);

    const beyond = await token(machine, {
      grant_type: "client_credentials",
      scope: "booking",
      resource: api,
    });
    expect(beyond.status).toBe(400);
    expect(await json(beyond)).toMatchObject({ error: "invalid_scope" });

    const wrongSecret = await token(
      { client_id: machine.client_id, client_secret: "nope" },
      { grant_type: "client_credentials", scope: "crm", resource: api },
    );
    expect(wrongSecret.status).toBe(401);
  });

  it("refuses client credentials to an app that signs people in", async () => {
    const response = await token(zone, { grant_type: "client_credentials", scope: "crm" });
    expect(response.status).toBe(400);
  });

  it("tells the zone when the user signs out, with a signed logout token", async () => {
    // A zone keeps a refresh token for its session: the server tells the clients holding a
    // token for the session that ends, so one with only an ID token wouldn't hear of it.
    const { response } = await signInToZone(zone, "openid offline_access crm");
    expect(response.status).toBe(200);
    const idToken = String((await json(response)).id_token);
    const sid = (await jwtVerify(idToken, await keys(), { issuer: BASE_URL })).payload.sid;

    const delivered: { url: string; body: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      delivered.push({ url: String(input), body: String(init?.body ?? "") });
      return new Response(null, { status: 200 });
    });
    const signOut = await user.request("POST", "/api/auth/sign-out", { json: {} });
    expect(signOut.status).toBe(200);
    await vi.waitFor(() => expect(delivered).toHaveLength(1));

    expect(delivered[0]?.url).toBe(logoutUri);
    const logoutToken = new URLSearchParams(delivered[0]?.body).get("logout_token") ?? "";
    const { payload, protectedHeader } = await jwtVerify(logoutToken, await keys(), {
      issuer: BASE_URL,
      audience: zone.client_id,
      typ: "logout+jwt",
    });
    expect(protectedHeader.alg).toBe("RS256");
    expect(payload).toMatchObject({
      sub: userId,
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
    });
    if (sid !== undefined) expect(payload.sid).toBe(sid);
    expect(payload.nonce).toBeUndefined();
  });
});

describe("pushed authorization requests (RFC 9126)", () => {
  const ip = "203.0.113.70";
  const callback = `${APP_ORIGIN}/api/auth/callback`;
  /** A client, and how it sends its secret: in the Authorization header unless `post`. */
  type Credentials = { client_id: string; client_secret?: string | undefined; post?: boolean };
  let h: Harness;
  let user: Awaited<ReturnType<typeof verifiedUser>>;
  let app: Credentials;
  let other: Credentials;
  let spa: Credentials;
  let poster: Credentials;

  beforeAll(async () => {
    h = await createHarness();
    const admin = await verifiedUser(h, "par-admin@example.com", ip);
    await h.sql("update users set role = 'admin' where email = $1", ["par-admin@example.com"]);
    const headers = cookieHeaders(admin.jar);
    user = await verifiedUser(h, "par-user@example.com", "203.0.113.71");
    // First-party apps (no consent screen), so an authorize request answers with a code.
    const body = { ...oidcClientDefaults(), redirect_uris: [callback], skip_consent: true };
    app = await h.auth.api.adminCreateOAuthClient({
      headers,
      body: { ...body, client_name: "PAR web", token_endpoint_auth_method: "client_secret_basic" },
    });
    other = await h.auth.api.adminCreateOAuthClient({
      headers,
      body: {
        ...body,
        client_name: "PAR other",
        token_endpoint_auth_method: "client_secret_basic",
      },
    });
    spa = await h.auth.api.adminCreateOAuthClient({
      headers,
      body: { ...body, client_name: "PAR SPA", token_endpoint_auth_method: "none" },
    });
    const posted = await h.auth.api.adminCreateOAuthClient({
      headers,
      body: { ...body, client_name: "PAR post", token_endpoint_auth_method: "client_secret_post" },
    });
    poster = { ...posted, post: true };
  });

  /** A server-to-server POST, as an app's backend makes it: a form, no Origin, no cookies. */
  function post(path: string, form: Record<string, string>, credentials?: Credentials) {
    const headers = new Headers({
      "content-type": "application/x-www-form-urlencoded",
      "x-forwarded-for": "198.51.100.70",
    });
    if (credentials?.client_secret && credentials.post) {
      form.client_secret = credentials.client_secret;
    } else if (credentials?.client_secret) {
      const basic = `${credentials.client_id}:${credentials.client_secret}`;
      headers.set("authorization", `Basic ${Buffer.from(basic).toString("base64")}`);
    }
    return h.auth.handler(
      new Request(`${BASE_URL}/api/auth${path}`, {
        method: "POST",
        headers,
        body: new URLSearchParams(form).toString(),
      }),
    );
  }

  /** The authorization parameters an app would push, with its PKCE verifier. */
  function parameters(clientId: string, overrides: Record<string, string> = {}) {
    const verifier = randomBytes(32).toString("base64url");
    const form: Record<string, string> = {
      response_type: "code",
      client_id: clientId,
      redirect_uri: callback,
      scope: "openid email",
      state: "par-state",
      nonce: "par-nonce",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      ...overrides,
    };
    // An empty override takes the parameter away.
    for (const [name, value] of Object.entries(form)) if (value === "") delete form[name];
    return { form, verifier };
  }

  async function push(credentials: Credentials, overrides: Record<string, string> = {}) {
    const { form, verifier } = parameters(credentials.client_id, overrides);
    const response = await post("/oauth2/par", form, credentials);
    expect(response.status).toBe(201);
    const body = await json(response);
    return { requestUri: String(body.request_uri), verifier, body, response };
  }

  /** The browser's step: /oauth2/authorize with only client_id and request_uri. */
  async function authorize(clientId: string, requestUri: string) {
    const query = new URLSearchParams({ client_id: clientId, request_uri: requestUri });
    const response = await user.request("GET", `/api/auth/oauth2/authorize?${query}`);
    return new URL(response.headers.get("location") ?? "", BASE_URL);
  }

  it("advertises the endpoint in both discovery documents", async () => {
    const advertised = {
      pushed_authorization_request_endpoint: `${BASE_URL}/api/auth/oauth2/par`,
      require_pushed_authorization_requests: false,
    };
    expect(await h.auth.api.getOpenIdConfig()).toMatchObject(advertised);
    expect(await h.auth.api.getOAuthServerConfig()).toMatchObject(advertised);
  });

  it("sends a browser that isn't signed in to /login with the pushed request, signed", async () => {
    const { requestUri } = await push(app);
    const query = new URLSearchParams({ client_id: app.client_id, request_uri: requestUri });
    const response = await h
      .browser("203.0.113.72")
      .request("GET", `/api/auth/oauth2/authorize?${query}`);
    const location = new URL(response.headers.get("location") ?? "", BASE_URL);
    expect(location.pathname).toBe("/login");
    // The pushed parameters, which the sign-in pages carry on with, as for any other request.
    expect(location.searchParams.get("redirect_uri")).toBe(callback);
    expect(location.searchParams.get("state")).toBe("par-state");
    expect(location.searchParams.get("sig")).toBeTruthy();
    expect(location.searchParams.has("request_uri")).toBe(false);
  });

  it("signs the user in from a request_uri, and the code works with the pushed PKCE", async () => {
    const { requestUri, verifier, body, response } = await push(app);
    expect(requestUri).toMatch(/^urn:ietf:params:oauth:request_uri:[\w-]{43}$/);
    expect(body.expires_in).toBe(60);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const location = await authorize(app.client_id, requestUri);
    expect(`${location.origin}${location.pathname}`).toBe(callback);
    expect(location.searchParams.get("state")).toBe("par-state");
    const code = location.searchParams.get("code") ?? "";
    expect(code).toBeTruthy();

    const token = await post(
      "/oauth2/token",
      { grant_type: "authorization_code", code, redirect_uri: callback, code_verifier: verifier },
      app,
    );
    expect(token.status).toBe(200);
    expect(await json(token)).toMatchObject({ token_type: "Bearer", id_token: expect.any(String) });
  });

  it("takes a public client's push with its client_id alone", async () => {
    const { requestUri } = await push(spa);
    const location = await authorize(spa.client_id, requestUri);
    expect(location.searchParams.get("code")).toBeTruthy();
  });

  it("uses a request_uri once", async () => {
    const { requestUri } = await push(app);
    expect((await authorize(app.client_id, requestUri)).searchParams.get("code")).toBeTruthy();
    const again = await authorize(app.client_id, requestUri);
    expect(again.searchParams.get("code")).toBeNull();
    expect(again.searchParams.get("error")).toBe("invalid_request_uri");
  });

  it("refuses another client's request_uri, without spending it", async () => {
    const { requestUri } = await push(app);
    const stolen = await authorize(other.client_id, requestUri);
    expect(stolen.searchParams.get("error")).toBe("invalid_request_uri");
    expect((await authorize(app.client_id, requestUri)).searchParams.get("code")).toBeTruthy();
  });

  it("refuses an expired request_uri, and one it didn't issue", async () => {
    const { requestUri } = await push(app);
    await h.sql("update oauth_pushed_requests set expires_at = now() - interval '1 second'");
    expect((await authorize(app.client_id, requestUri)).searchParams.get("error")).toBe(
      "invalid_request_uri",
    );
    const made = await authorize(app.client_id, "urn:ietf:params:oauth:request_uri:made-up");
    expect(made.searchParams.get("error")).toBe("invalid_request_uri");
  });

  it("keeps only a hash of the request_uri, and no client credentials", async () => {
    // client_secret_post: the secret is one of the form's fields, and must not be kept with them.
    const { requestUri } = await push(poster);
    const { rows } = await h.sql(
      "select request_uri_hash, parameters from oauth_pushed_requests order by created_at desc limit 1",
    );
    const row = rows[0] as { request_uri_hash: string; parameters: Record<string, string> };
    expect(row.request_uri_hash).not.toContain(requestUri.split(":").at(-1));
    expect(row.parameters).not.toHaveProperty("client_secret");
    expect(row.parameters.client_id).toBe(poster.client_id);
  });

  it("authenticates the client as the token endpoint does", async () => {
    const { form } = parameters(app.client_id);
    const wrong = await post("/oauth2/par", form, { ...app, client_secret: "not-the-secret" });
    expect(wrong.status).toBe(401);
    expect(await json(wrong)).toMatchObject({ error: "invalid_client" });
    const none = await post("/oauth2/par", form);
    expect(none.status).toBeGreaterThanOrEqual(400);
    expect(await json(none)).toMatchObject({ error: "invalid_client" });
  });

  it.each([
    ["no PKCE", { code_challenge: "", code_challenge_method: "" }, "invalid_request"],
    ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
    ["an unregistered redirect_uri", { redirect_uri: `${APP_ORIGIN}/other` }, "invalid_request"],
    ["a scope it wasn't given", { scope: "openid admin" }, "invalid_scope"],
    ["another response_type", { response_type: "token" }, "unsupported_response_type"],
    ["a request_uri", { request_uri: "urn:ietf:params:oauth:request_uri:x" }, "invalid_request"],
    ["another client's id", { client_id: "someone-else" }, "invalid_request"],
  ])("refuses a push with %s", async (_, overrides, error) => {
    const { form } = parameters(app.client_id, overrides);
    const response = await post("/oauth2/par", form, app);
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error });
  });
});
