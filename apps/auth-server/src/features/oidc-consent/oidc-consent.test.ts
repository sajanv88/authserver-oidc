// The consent feature against the real auth configuration (PGlite), over HTTP: what the page
// makes of its signed query, and the answers ConsentForm sends.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn, testEnv } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { ConsentDecisionSchema } from "./schemas/consent";
import { decide } from "./server/consent";
import { readConsentRequest } from "./server/pages";
import { consentScopes } from "./server/scopes";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;
const secret = testEnv.betterAuthSecret;

describe("consent rules", () => {
  it("puts the asked-for scopes in words, in order, once each, leaving out unknown ones", () => {
    expect(consentScopes("openid email email profile admin").map((s) => s.scope)).toEqual([
      "openid",
      "email",
      "profile",
    ]);
    expect(consentScopes(null)).toEqual([]);
    expect(consentScopes("offline_access")[0]?.title).toBe("Stay connected");
  });

  it("says what an API scope lets the app do, but only for scopes this server offers", () => {
    expect(consentScopes("openid crm billing", { apiScopes: ["crm"] })).toEqual([
      expect.objectContaining({ scope: "openid" }),
      expect.objectContaining({ scope: "crm", title: "Act for you in crm" }),
    ]);
    expect(consentScopes("crm").map((s) => s.scope)).toEqual([]);
  });

  it("names the server as APP_NAME says, or Auth Server", () => {
    expect(consentScopes("openid", { appName: "Acme ID" })[0]?.description).toBe(
      "Your Acme ID account ID, so the app recognises you next time.",
    );
    expect(consentScopes("openid")[0]?.description).toContain("Your Auth Server account ID");
  });

  it("takes Allow or Deny, nothing else", () => {
    expect(parseForm(ConsentDecisionSchema, { decision: "allow" })).toEqual({
      ok: true,
      value: { decision: "allow" },
    });
    expect(parseForm(ConsentDecisionSchema, { decision: "maybe" })).toMatchObject({ ok: false });
  });

  it("refuses a query this server didn't sign", async () => {
    expect(await readConsentRequest({ client_id: "x", scope: "openid" }, secret)).toEqual({
      status: "invalid",
    });
  });
});

describe("deciding on consent", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.120");
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

  /** A new user signs in inside the app's request: returns their browser and /consent's query. */
  async function reachConsent(email: string, ip: string): Promise<[Browser, string]> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state: "st",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const consent = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(consent.pathname).toBe(AUTH_PAGES.consent);
    return [browser, consent.search.slice(1)];
  }

  function decide(browser: Browser, accept: boolean, oauthQuery: string) {
    // ConsentForm's request: the client adds the page's query as oauth_query.
    return browser.request("POST", "/api/auth/oauth2/consent", {
      json: { accept, oauth_query: oauthQuery },
    });
  }

  it("the page shows what the signature vouches for, and nothing altered", async () => {
    const [, query] = await reachConsent("ada@example.com", "203.0.113.121");
    expect(await readConsentRequest(query, secret)).toMatchObject({
      status: "valid",
      clientId,
      scopes: [{ scope: "openid" }, { scope: "profile" }, { scope: "email" }],
    });

    const widened = new URLSearchParams(query);
    widened.set("scope", "openid profile email offline_access");
    expect(await readConsentRequest(widened, secret)).toMatchObject({
      status: "expired",
      restartUrl: expect.stringMatching(/^\/api\/auth\/oauth2\/authorize\?/),
    });
    const late = new URLSearchParams(query);
    late.set("exp", String(Math.floor(Date.now() / 1000) - 1));
    expect((await readConsentRequest(late, secret)).status).toBe("expired");
  });

  it("Allow sends a code back to the app and remembers the consent", async () => {
    const [browser, query] = await reachConsent("grace@example.com", "203.0.113.122");
    const answer = (await (await decide(browser, true, query)).json()) as { url?: string };
    const callback = new URL(answer.url ?? "");
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("code")).toBeTruthy();
    expect(callback.searchParams.get("state")).toBe("st");
    const { rows } = await h.sql(
      "select c.scopes from oauth_consents c join users u on u.id = c.user_id where u.email = $1",
      ["grace@example.com"],
    );
    expect(rows).toEqual([{ scopes: ["openid", "profile", "email"] }]);
  });

  it("Deny sends access_denied back to the app, and records nothing", async () => {
    const [browser, query] = await reachConsent("alan@example.com", "203.0.113.123");
    const answer = (await (await decide(browser, false, query)).json()) as { url?: string };
    const callback = new URL(answer.url ?? "");
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.get("state")).toBe("st");
    expect(callback.searchParams.get("code")).toBeNull();
    const { rows } = await h.sql(
      "select 1 from oauth_consents c join users u on u.id = c.user_id where u.email = $1",
      ["alan@example.com"],
    );
    expect(rows).toEqual([]);
  });

  it("refuses an expired request (invalid_signature) and a missing session (401)", async () => {
    const [browser, query] = await reachConsent("katherine@example.com", "203.0.113.124");
    const late = new URLSearchParams(query);
    late.set("exp", String(Math.floor(Date.now() / 1000) - 1));
    const expired = await decide(browser, true, late.toString());
    // The two answers ConsentForm turns into "This request has expired".
    expect(((await expired.json()) as { error?: string }).error).toBe("invalid_signature");
    const anonymous = await decide(h.browser("203.0.113.125"), true, query);
    expect(anonymous.status).toBe(401);
  });
});

describe("the consent action's server side (decide)", () => {
  let h: Harness;
  let clientId = "";
  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.240");
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

  async function consentQuery(email: string, ip: string): Promise<[Browser, string]> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid",
      state: "st",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    return [browser, new URL(authorize.headers.get("location") ?? "", BASE_URL).search.slice(1)];
  }

  it("Allow comes back with a code for the app, Deny with access_denied", async () => {
    const [ada, adaQuery] = await consentQuery("ada@example.com", "203.0.113.241");
    const allowed = await decide(ada.caller(), true, adaQuery);
    if (!allowed.ok) throw new Error("expected an answer");
    expect(new URL(allowed.url).searchParams.get("code")).toBeTruthy();

    const [alan, alanQuery] = await consentQuery("alan@example.com", "203.0.113.242");
    const denied = await decide(alan.caller(), false, alanQuery);
    if (!denied.ok) throw new Error("expected an answer");
    expect(new URL(denied.url).searchParams.get("error")).toBe("access_denied");
  });

  it("an expired request, or no session, is 'expired'", async () => {
    const [grace, query] = await consentQuery("grace@example.com", "203.0.113.243");
    const late = new URLSearchParams(query);
    late.set("exp", String(Math.floor(Date.now() / 1000) - 1));
    expect(await decide(grace.caller(), true, late.toString())).toEqual({
      ok: false,
      problem: { kind: "expired" },
    });
    expect(await decide(h.browser("203.0.113.244").caller(), true, query)).toEqual({
      ok: false,
      problem: { kind: "expired" },
    });
  });
});
