// The magic-link feature: what its page makes of its query, and the round trip against the
// real auth configuration (PGlite) over HTTP.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { requestMagicLink } from "./server/magic-link";
import { magicLinkTargets } from "./server/pages";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("magic-link page targets", () => {
  it("outside an app: signs in to returnTo (or the account), failures come back with it", () => {
    expect(magicLinkTargets({ returnTo: "/admin/clients" })).toEqual({
      callbackURL: "/admin/clients",
      errorCallbackURL: "/magic-link?returnTo=%2Fadmin%2Fclients",
      linkFailed: false,
      loginHref: "/login?returnTo=%2Fadmin%2Fclients",
      retryHref: "/magic-link?returnTo=%2Fadmin%2Fclients",
    });
    expect(magicLinkTargets({ returnTo: "//evil.example" }).callbackURL).toBe("/account/security");
    expect(magicLinkTargets({ error: "INVALID_TOKEN" }).linkFailed).toBe(true);
  });
});

describe("signing in with a link inside an app's request for a fresh login", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.90");
    await admin.request("POST", "/api/auth/sign-up/email", {
      json: { email: "admin@example.com", password, name: "Admin" },
    });
    await admin.request("GET", linkIn(h.emails.at(-1)));
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    clientId = (
      await h.auth.api.adminCreateOAuthClient({
        body: { client_name: "Example app", redirect_uris: [redirectUri] },
        headers: new Headers({
          cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
        }),
      })
    ).client_id;
  });

  it("emails a link that signs in and lands at consent, not back at /login", async () => {
    const browser = h.browser("203.0.113.91");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email",
      state: "st",
      prompt: "login",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const login = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(login.pathname).toBe(AUTH_PAGES.login);

    // /login → "Email me a sign-in link instead" carries the signed query to /magic-link.
    const targets = magicLinkTargets(Object.fromEntries(login.searchParams));
    expect(targets.callbackURL).not.toContain("prompt");

    // The sign-in request with the signed query, as the login action sends it (oauth_query).
    const before = h.emails.length;
    const request = await browser.request("POST", "/api/auth/sign-in/magic-link", {
      json: {
        email: "admin@example.com",
        callbackURL: targets.callbackURL,
        errorCallbackURL: targets.errorCallbackURL,
        oauth_query: login.search.slice(1),
      },
    });
    expect(request.status).toBe(200);
    expect(h.emails.length).toBe(before + 1);

    const verify = await browser.request("GET", linkIn(h.emails.at(-1)));
    const landed = new URL(verify.headers.get("location") ?? "", BASE_URL);
    expect(landed.pathname).toBe("/api/auth/oauth2/authorize");
    expect([...browser.jar.keys()]).toContain("nvx-auth.session_token");

    const resumed = await browser.request("GET", `${landed.pathname}${landed.search}`);
    expect(new URL(resumed.headers.get("location") ?? "", BASE_URL).pathname).toBe(
      AUTH_PAGES.consent,
    );
  });

  it("sends a used link back to /magic-link with an error and the same query", async () => {
    const browser = h.browser("203.0.113.92");
    const targets = magicLinkTargets({ returnTo: "/account/security" });
    await browser.request("POST", "/api/auth/sign-in/magic-link", {
      json: { email: "admin@example.com", ...targets },
    });
    const link = linkIn(h.emails.at(-1));
    expect((await browser.request("GET", link)).status).toBe(302);
    const reused = await h.browser("203.0.113.93").request("GET", link);
    const back = new URL(reused.headers.get("location") ?? "", BASE_URL);
    expect(back.pathname).toBe(AUTH_PAGES.magicLink);
    expect(back.searchParams.get("returnTo")).toBe("/account/security");
    expect(back.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(magicLinkTargets(Object.fromEntries(back.searchParams)).linkFailed).toBe(true);
  });
});

describe("the magic-link action's server side", () => {
  it("answers alike for any address, and emails only an account that exists", async () => {
    const h = await createHarness();
    const browser = h.browser("203.0.113.230");
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email: "ada@example.com", password, name: "Ada" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    const before = h.emails.length;
    const call = h.browser("203.0.113.231").caller();
    const targets = { callbackURL: "/account/security", errorCallbackURL: AUTH_PAGES.magicLink };
    expect(await requestMagicLink(call, { email: "nobody@example.com", ...targets })).toEqual({
      kind: "sent",
    });
    expect(h.emails.length).toBe(before);
    expect(await requestMagicLink(call, { email: "ada@example.com", ...targets })).toEqual({
      kind: "sent",
    });
    expect(h.emails.length).toBe(before + 1);
  });
});
