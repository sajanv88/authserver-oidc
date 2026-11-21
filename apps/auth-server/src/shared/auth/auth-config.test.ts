// The real createAuth() configuration against a migrated PGlite database, driven over HTTP
// through Better Auth's handler. Each block uses its own client IP so rate-limit counters
// don't leak between them.
import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { withRootJwksUri } from "./discovery";
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
        json: { email: "new@example.com", password, name: "New", role: "admin" },
      });
      const body = await json(response);
      expect(response.status).toBe(200);
      expect(body.token).toBeNull();
      expect(browser.jar.size).toBe(0);
      expect(h.emails.at(-1)?.to).toBe("new@example.com");
      expect(h.emails.at(-1)?.subject).toContain("Confirm your email address");
    });

    it("never lets sign-up set the role", async () => {
      const { rows } = await h.sql("select role from users where email = $1", ["new@example.com"]);
      expect(rows).toEqual([{ role: "user" }]);
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
      expect(config.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
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
