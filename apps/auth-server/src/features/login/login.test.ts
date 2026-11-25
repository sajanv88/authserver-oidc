// The login feature against the real auth configuration (PGlite), over HTTP: the requests
// LoginForm makes and the answers it acts on.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { DISABLED_ACCOUNT_TEXT } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { LoginSchema } from "./schemas/login";
import { signIn } from "./server/sign-in";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("login form rules", () => {
  it("normalises the email and reads the checkbox", () => {
    expect(
      parseForm(LoginSchema, { email: " Ada@Example.com ", password: "x", rememberMe: "on" }),
    ).toEqual({ ok: true, value: { email: "ada@example.com", password: "x", rememberMe: true } });
    expect(parseForm(LoginSchema, { email: "ada@example.com", password: "x" })).toEqual({
      ok: true,
      value: { email: "ada@example.com", password: "x", rememberMe: undefined },
    });
  });

  it("asks for both fields, without judging the password's shape", () => {
    expect(parseForm(LoginSchema, { email: "", password: "" })).toEqual({
      ok: false,
      errors: { email: "Enter your email address.", password: "Enter your password." },
    });
  });
});

describe("signing in", () => {
  let h: Harness;
  let clientId = "";

  async function signUpAndConfirm(email: string, ip: string): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    return browser;
  }

  /** Starts an authorization request without a session; returns the signed login query. */
  async function loginQuery(browser: Browser): Promise<string> {
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state: "st",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const response = await browser.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const login = new URL(response.headers.get("location") ?? "", BASE_URL);
    expect(login.pathname).toBe(AUTH_PAGES.login);
    return login.search.slice(1);
  }

  /** The sign-in request, as the login action sends it from /login?<signed query>. */
  function signIn(browser: Browser, email: string, oauthQuery?: string) {
    return browser.request("POST", "/api/auth/sign-in/email", {
      json: {
        email,
        password,
        rememberMe: false,
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      },
    });
  }

  beforeAll(async () => {
    h = await createHarness();
    const admin = await signUpAndConfirm("admin@example.com", "203.0.113.70");
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    const client = await h.auth.api.adminCreateOAuthClient({
      body: { client_name: "Example app", redirect_uris: [redirectUri] },
      headers: new Headers({
        cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
      }),
    });
    clientId = client.client_id;
  });

  it("in an OIDC flow, answers with the way on: consent first, the app once consented", async () => {
    await signUpAndConfirm("ada@example.com", "203.0.113.71");

    // First time: sign-in answers with the consent page, which the client then follows.
    const first = h.browser("203.0.113.72");
    const firstAnswer = (await (
      await signIn(first, "ada@example.com", await loginQuery(first))
    ).json()) as {
      redirect?: boolean;
      url?: string;
    };
    expect(firstAnswer.redirect).toBe(true);
    const consent = new URL(firstAnswer.url ?? "", BASE_URL);
    expect(consent.pathname).toBe(AUTH_PAGES.consent);
    const accepted = await first.request("POST", "/api/auth/oauth2/consent", {
      json: { accept: true, oauth_query: consent.search.slice(1) },
    });
    expect(
      new URL(String(((await accepted.json()) as { url: string }).url)).searchParams.get("code"),
    ).toBeTruthy();

    // Next time, in another browser: consent is remembered, so straight back to the app.
    const second = h.browser("203.0.113.73");
    const secondAnswer = (await (
      await signIn(second, "ada@example.com", await loginQuery(second))
    ).json()) as {
      url?: string;
    };
    const callback = new URL(secondAnswer.url ?? "");
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("code")).toBeTruthy();
    expect(callback.searchParams.get("state")).toBe("st");
  });

  it("refuses a tampered or expired authorization query with invalid_signature", async () => {
    const browser = h.browser("203.0.113.74");
    const query = new URLSearchParams(await loginQuery(browser));
    // Fresh, it's valid for 10 minutes: time to sign in, find an authenticator and consent.
    const secondsLeft = Number(query.get("exp")) - Math.floor(Date.now() / 1000);
    expect(secondsLeft).toBeGreaterThan(590);
    expect(secondsLeft).toBeLessThanOrEqual(600);
    query.set("exp", String(Math.floor(Date.now() / 1000) - 60));
    const response = await signIn(browser, "ada@example.com", query.toString());
    expect(response.status).toBe(400);
    // The key LoginForm reads to offer "start again".
    expect(((await response.json()) as { error?: string }).error).toBe("invalid_signature");
    expect(browser.jar.size).toBe(0);
  });

  it("asks for a second factor, without a session, when two-factor is on", async () => {
    const browser = await signUpAndConfirm("guarded@example.com", "203.0.113.75");
    await browser.request("POST", "/api/auth/two-factor/enable", { json: { password } });
    await h.sql("update users set two_factor_enabled = true where email = $1", [
      "guarded@example.com",
    ]);

    const fresh = h.browser("203.0.113.76");
    const response = await signIn(fresh, "guarded@example.com");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
    expect([...fresh.jar.keys()]).not.toContain("nvx-auth.session_token");
  });

  it("refuses an unconfirmed address with EMAIL_NOT_VERIFIED and sends a new link", async () => {
    const browser = h.browser("203.0.113.77");
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email: "pending@example.com", password, name: "Pending" },
    });
    const before = h.emails.length;
    const response = await signIn(browser, "pending@example.com");
    expect(response.status).toBe(403);
    expect(((await response.json()) as { code?: string }).code).toBe("EMAIL_NOT_VERIFIED");
    expect(h.emails.length).toBe(before + 1);
    expect(h.emails.at(-1)?.to).toBe("pending@example.com");
  });
});

describe("the sign-in action's outcomes (signIn, as signInAction calls it)", () => {
  let h: Harness;
  let clientId = "";

  async function confirmed(email: string, ip: string): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    return browser;
  }

  beforeAll(async () => {
    h = await createHarness();
    const admin = await confirmed("admin@example.com", "203.0.113.190");
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    clientId = (
      await h.auth.api.adminCreateOAuthClient({
        body: { client_name: "Example app", redirect_uris: [redirectUri] },
        headers: new Headers({
          cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
        }),
      })
    ).client_id;
    await confirmed("ada@example.com", "203.0.113.191");
  });

  const input = (email: string, pass = password) => ({
    email,
    password: pass,
    rememberMe: undefined,
  });

  it("outside an app: signed in, with the session cookie set", async () => {
    const browser = h.browser("203.0.113.192");
    expect(await signIn(browser.caller(), input("ada@example.com"), "")).toEqual({
      kind: "signed-in",
    });
    expect([...browser.jar.keys()]).toContain("nvx-auth.session_token");
  });

  it("inside an app's flow: continues to consent", async () => {
    const browser = h.browser("203.0.113.193");
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
    const signed = new URL(authorize.headers.get("location") ?? "", BASE_URL).search.slice(1);
    const outcome = await signIn(browser.caller(), input("ada@example.com"), signed);
    if (outcome.kind !== "continue") throw new Error(`expected continue, got ${outcome.kind}`);
    expect(new URL(outcome.url, BASE_URL).pathname).toBe(AUTH_PAGES.consent);
  });

  it("hands over to /two-factor with the pending cookie, and no session", async () => {
    const guarded = await confirmed("guarded@example.com", "203.0.113.194");
    await guarded.request("POST", "/api/auth/two-factor/enable", { json: { password } });
    await h.sql("update users set two_factor_enabled = true where email = $1", [
      "guarded@example.com",
    ]);
    const browser = h.browser("203.0.113.195");
    expect(await signIn(browser.caller(), input("guarded@example.com"), "")).toEqual({
      kind: "two-factor",
    });
    expect([...browser.jar.keys()]).toContain("nvx-auth.two_factor");
    expect([...browser.jar.keys()]).not.toContain("nvx-auth.session_token");
  });

  it("says why it was refused, the same for a wrong password and an unknown email", async () => {
    const browser = h.browser("203.0.113.196");
    const wrong = await signIn(browser.caller(), input("ada@example.com", "not my password"), "");
    const unknown = await signIn(browser.caller(), input("nobody@example.com"), "");
    expect(wrong).toEqual({
      kind: "problem",
      problem: { kind: "message", text: "Email or password is incorrect." },
    });
    expect(unknown).toEqual(wrong);
  });

  it("tells a disabled account's owner it's disabled, and only with the right password", async () => {
    await confirmed("gone@example.com", "203.0.113.197");
    await h.sql("update users set banned = true where email = $1", ["gone@example.com"]);
    const right = await signIn(h.browser("203.0.113.198").caller(), input("gone@example.com"), "");
    expect(right).toEqual({
      kind: "problem",
      problem: { kind: "message", text: DISABLED_ACCOUNT_TEXT },
    });
    const wrong = await signIn(
      h.browser("203.0.113.199").caller(),
      input("gone@example.com", "not my password"),
      "",
    );
    expect(wrong).toEqual({
      kind: "problem",
      problem: { kind: "message", text: "Email or password is incorrect." },
    });
  });
});
