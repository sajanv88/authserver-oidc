// The admin plugin and the account rules (account-policy.ts, the postLogin step and the
// required-two-factor checks) in the real createAuth() configuration, over HTTP.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "./test-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function cookieHeaders(browser: Browser): Headers {
  return new Headers({
    cookie: [...browser.jar].map(([name, value]) => `${name}=${value}`).join("; "),
  });
}

// A new client IP for each person, so the sign-up and sign-in rate limits never answer.
let nextIp = 1;
const freshIp = () => `198.51.100.${nextIp++}`;

/** Signs up, confirms the address, and returns a signed-in browser and the user's id. */
async function person(h: Harness, email: string) {
  const browser = h.browser(freshIp());
  await browser.request("POST", "/api/auth/sign-up/email", {
    json: { email, password, name: email.split("@")[0] },
  });
  await browser.request("GET", linkIn(h.emails.at(-1)));
  const { rows } = await h.sql("select id from users where email = $1", [email]);
  return { browser, id: (rows[0] as { id: string }).id, email };
}

/** Signs in again with the password, from a new client. */
async function signIn(h: Harness, email: string): Promise<Response> {
  return h.browser(freshIp()).request("POST", "/api/auth/sign-in/email", {
    json: { email, password },
  });
}

function authorizeQuery(clientId: string): URLSearchParams {
  const verifier = randomBytes(32).toString("base64url");
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    state: "s",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
}

describe("admin plugin and account rules", () => {
  let h: Harness;
  let admin: Awaited<ReturnType<typeof person>>;

  beforeAll(async () => {
    h = await createHarness();
    admin = await person(h, "admin@example.com");
    await h.sql("update users set role = 'admin' where id = $1", [admin.id]);
  });

  /** Calls an admin endpoint as the admin's browser would. */
  const asAdmin = (path: string, body: Record<string, unknown>) =>
    admin.browser.request("POST", `/api/auth${path}`, { json: body });

  it("doesn't offer impersonation, setting passwords or emails, or creating users", async () => {
    const target = await person(h, "target@example.com");
    for (const path of [
      "/admin/impersonate-user",
      "/admin/stop-impersonating",
      "/admin/set-user-password",
      "/admin/update-user",
      "/admin/create-user",
    ]) {
      const response = await asAdmin(path, { userId: target.id, newPassword: password });
      expect(response.status, path).toBe(404);
    }
  });

  it("lets only admins use the admin endpoints", async () => {
    const someone = await person(h, "someone@example.com");
    const response = await someone.browser.request("POST", "/api/auth/admin/ban-user", {
      json: { userId: admin.id },
    });
    expect(response.status).toBe(403);
  });

  describe("roles", () => {
    it("are user or admin, nothing else", async () => {
      const grace = await person(h, "grace@example.com");
      const refused = await asAdmin("/admin/set-role", { userId: grace.id, role: "owner" });
      expect(refused.status).toBe(400);
      expect(await json(refused)).toMatchObject({ code: "INVALID_ROLE" });
      const list = await asAdmin("/admin/set-role", { userId: grace.id, role: ["admin"] });
      expect(list.status).toBe(400);

      expect((await asAdmin("/admin/set-role", { userId: grace.id, role: "admin" })).status).toBe(
        200,
      );
      const { rows } = await h.sql("select role from users where id = $1", [grace.id]);
      expect(rows).toEqual([{ role: "admin" }]);
    });

    it("can't be changed by the admin themselves", async () => {
      const response = await asAdmin("/admin/set-role", { userId: admin.id, role: "user" });
      expect(response.status).toBe(400);
      expect(await json(response)).toMatchObject({ code: "YOU_CANNOT_CHANGE_YOUR_OWN_ROLE" });
    });
  });

  describe("a disabled account", () => {
    let ada: Awaited<ReturnType<typeof person>>;
    let client: { client_id: string; client_secret?: string | undefined };

    beforeAll(async () => {
      ada = await person(h, "ada@example.com");
      client = await h.auth.api.adminCreateOAuthClient({
        body: {
          client_name: "App",
          redirect_uris: [redirectUri],
          token_endpoint_auth_method: "client_secret_basic",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          require_pkce: true,
          skip_consent: true,
        },
        headers: cookieHeaders(admin.browser),
      });
    });

    it("loses its sessions and every app token, offline ones included", async () => {
      // Ada signed in to an app with offline_access: a refresh token that outlives her session.
      const authorize = await ada.browser.request(
        "GET",
        `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id)}`,
      );
      expect(
        new URL(authorize.headers.get("location") ?? "").searchParams.get("code"),
      ).toBeTruthy();
      await h.sql(
        "insert into oauth_refresh_tokens (token, client_id, user_id, scopes, expires_at) values ('offline', $1, $2, '{openid,offline_access}', now() + interval '30 days')",
        [client.client_id, ada.id],
      );

      const ban = await asAdmin("/admin/ban-user", { userId: ada.id, banReason: "left" });
      expect(ban.status).toBe(200);

      const sessions = await h.sql("select 1 from sessions where user_id = $1", [ada.id]);
      expect(sessions.rows).toEqual([]);
      const live = await h.sql(
        "select token from oauth_refresh_tokens where user_id = $1 and revoked is null",
        [ada.id],
      );
      expect(live.rows).toEqual([]);
      expect((await ada.browser.request("GET", "/api/auth/get-session")).status).toBe(200);
      expect(await (await ada.browser.request("GET", "/api/auth/get-session")).json()).toBeNull();
    });

    it("can't sign in, by password or by an emailed link", async () => {
      const refused = await signIn(h, ada.email);
      expect(refused.status).toBe(403);
      expect(await json(refused)).toMatchObject({ code: "BANNED_USER" });

      const before = h.emails.length;
      await h.browser(freshIp()).request("POST", "/api/auth/sign-in/magic-link", {
        json: { email: ada.email },
      });
      expect(h.emails.length).toBe(before + 1);
      const link = await h.browser(freshIp()).request("GET", linkIn(h.emails.at(-1)));
      expect(link.headers.getSetCookie().join(";")).not.toMatch(/session_token=[^;]+/);
    });

    it("signs in again once enabled", async () => {
      expect((await asAdmin("/admin/unban-user", { userId: ada.id })).status).toBe(200);
      expect((await signIn(h, ada.email)).status).toBe(200);
    });

    it("can't be the admin themselves", async () => {
      const response = await asAdmin("/admin/ban-user", { userId: admin.id });
      expect(response.status).toBe(400);
    });
  });

  it("signing someone out everywhere also revokes their apps' tokens", async () => {
    const lin = await person(h, "lin@example.com");
    const { rows } = await h.sql("select client_id from oauth_clients limit 1");
    const clientId = (rows[0] as { client_id: string }).client_id;
    await h.sql(
      "insert into oauth_refresh_tokens (token, client_id, user_id, scopes, expires_at) values ('lin-offline', $1, $2, '{openid,offline_access}', now() + interval '30 days')",
      [clientId, lin.id],
    );
    expect((await asAdmin("/admin/revoke-user-sessions", { userId: lin.id })).status).toBe(200);
    const live = await h.sql(
      "select 1 from oauth_refresh_tokens where user_id = $1 and revoked is null",
      [lin.id],
    );
    expect(live.rows).toEqual([]);
    expect(await (await lin.browser.request("GET", "/api/auth/get-session")).json()).toBeNull();
  });
});

describe("required two-factor", () => {
  let h: Harness;
  let client: { client_id: string };

  beforeAll(async () => {
    h = await createHarness({ twoFactorRequiredForAdmins: true });
    const admin = await person(h, "admin@example.com");
    await h.sql("update users set role = 'admin' where id = $1", [admin.id]);
    client = await h.auth.api.adminCreateOAuthClient({
      body: {
        client_name: "App",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "client_secret_basic",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        require_pkce: true,
        skip_consent: true,
      },
      headers: cookieHeaders(admin.browser),
    });
  });

  it("stops an app's sign-in at the set-up page until two-factor is on, then continues it", async () => {
    const ada = await person(h, "ada@example.com");
    await h.sql("update users set two_factor_required = true where id = $1", [ada.id]);

    const authorize = await ada.browser.request(
      "GET",
      `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id)}`,
    );
    const setUp = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(setUp.pathname).toBe("/account/security/two-factor");
    expect(setUp.searchParams.get("code")).toBeNull();
    expect(setUp.searchParams.get("sig")).toBeTruthy();

    // Asking to continue before it's on goes back to the page.
    const early = await ada.browser.request("POST", "/api/auth/oauth2/continue", {
      json: { postLogin: true, oauth_query: setUp.search.slice(1) },
    });
    expect(String((await json(early)).url)).toContain("/account/security/two-factor");

    await h.sql("update users set two_factor_enabled = true where id = $1", [ada.id]);
    const continued = await ada.browser.request("POST", "/api/auth/oauth2/continue", {
      json: { postLogin: true, oauth_query: setUp.search.slice(1) },
    });
    const callback = new URL(String((await json(continued)).url));
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("code")).toBeTruthy();
  });

  it("applies to every admin when the setting is on", async () => {
    const grace = await person(h, "grace@example.com");
    const first = await grace.browser.request(
      "GET",
      `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id)}`,
    );
    expect(new URL(first.headers.get("location") ?? "").searchParams.get("code")).toBeTruthy();

    await h.sql("update users set role = 'admin' where id = $1", [grace.id]);
    const second = await grace.browser.request(
      "GET",
      `/api/auth/oauth2/authorize?${authorizeQuery(client.client_id)}`,
    );
    expect(new URL(second.headers.get("location") ?? "", BASE_URL).pathname).toBe(
      "/account/security/two-factor",
    );
  });

  it("gives apps reading the shared cookie no session until it's on, but not this server", async () => {
    const lin = await person(h, "lin@example.com");
    await h.sql("update users set two_factor_required = true where id = $1", [lin.id]);

    const overHttp = await lin.browser.request("GET", "/api/auth/get-session");
    expect(await overHttp.json()).toBeNull();
    const own = await h.auth.api.getSession({ headers: cookieHeaders(lin.browser) });
    expect(own?.user.email).toBe("lin@example.com");

    await h.sql("update users set two_factor_enabled = true where id = $1", [lin.id]);
    const after = await lin.browser.request("GET", "/api/auth/get-session");
    expect(await json(after)).toMatchObject({ user: { email: "lin@example.com" } });
  });

  it("can't be turned off by someone who must have it", async () => {
    const kim = await person(h, "kim@example.com");
    await h.sql(
      "update users set two_factor_required = true, two_factor_enabled = true where id = $1",
      [kim.id],
    );
    const response = await kim.browser.request("POST", "/api/auth/two-factor/disable", {
      json: { password },
    });
    expect(response.status).toBe(403);
    expect(await json(response)).toMatchObject({ code: "TWO_FACTOR_REQUIRED" });
  });
});
