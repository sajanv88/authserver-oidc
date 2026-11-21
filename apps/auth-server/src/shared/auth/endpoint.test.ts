// The server actions' way into Better Auth (callEndpoint, through auth.handler), against the
// real configuration on PGlite: the rate limiter still counts the real client, cookies come back,
// and the signed OIDC query continues the flow.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "./auth-pages";
import { continuationUrl } from "./endpoint";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "./test-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("calling Better Auth from a server action", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.180");
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

  it("is rate limited by the real client IP, whatever the client puts in X-Forwarded-For", async () => {
    const browser = h.browser("203.0.113.181");
    const statuses: number[] = [];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      // A new forged address each time, in front of what the ingress appends.
      const call = browser.caller({
        forwardedFor: `198.51.100.${attempt}, 203.0.113.181, 10.0.0.2`,
      });
      const result = await call({
        path: "/sign-in/email",
        body: { email: "admin@example.com", password: "not the password" },
      });
      statuses.push(result.status);
    }
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it("hands back the cookies Better Auth sets, so the browser is signed in", async () => {
    const browser = h.browser("203.0.113.182");
    const result = await browser.caller()({
      path: "/sign-in/email",
      body: { email: "admin@example.com", password },
    });
    expect(result.ok).toBe(true);
    expect(result.setCookies.some((cookie) => cookie.startsWith("nvx-auth.session_token="))).toBe(
      true,
    );
    const session = await h.auth.api.getSession({
      headers: new Headers({
        cookie: [...browser.jar].map(([name, value]) => `${name}=${value}`).join("; "),
      }),
    });
    expect(session?.user.email).toBe("admin@example.com");
  });

  it("with the signed query, continues the app's flow (consent first)", async () => {
    const browser = h.browser("203.0.113.183");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid email",
      state: "st",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const login = new URL(authorize.headers.get("location") ?? "", BASE_URL);

    const result = await browser.caller()({
      path: "/sign-in/email",
      body: { email: "admin@example.com", password },
      oauthQuery: login.search.slice(1),
    });
    if (!result.ok) throw new Error(`refused: ${result.status}`);
    const url = continuationUrl(result.data);
    expect(new URL(url ?? "", BASE_URL).pathname).toBe(AUTH_PAGES.consent);
  });

  it("records the browser's own IP on the session, not the server's", async () => {
    const browser = h.browser("203.0.113.184");
    await browser.caller()({
      path: "/sign-in/email",
      body: { email: "admin@example.com", password },
    });
    const { rows } = await h.sql(
      "select ip_address from sessions order by created_at desc limit 1",
    );
    expect(rows).toEqual([{ ip_address: "203.0.113.184" }]);
  });
});
