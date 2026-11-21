// The signup feature against the real auth configuration (PGlite), over HTTP: the requests its
// forms make, and the URLs its pages produce.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { authorizeUrlFrom } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { ResendVerificationSchema, SignUpSchema } from "./schemas/signup";
import { resendVerification, signUp } from "./server/sign-up";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("sign-up form rules", () => {
  it("accepts a valid form, trimming and lowercasing the email", () => {
    expect(
      parseForm(SignUpSchema, { name: " Ada ", email: " Ada@Example.COM ", password }),
    ).toEqual({ ok: true, value: { name: "Ada", email: "ada@example.com", password } });
  });

  it("gives one message per field, saying what to do", () => {
    expect(parseForm(SignUpSchema, { name: "", email: "nope", password: "short" })).toEqual({
      ok: false,
      errors: {
        name: "Enter your name.",
        email: "Enter an email address like name@example.com.",
        password: "Use at least 12 characters.",
      },
    });
  });

  it("refuses a password longer than Better Auth allows", () => {
    const result = parseForm(SignUpSchema, {
      name: "A",
      email: "a@b.co",
      password: "x".repeat(129),
    });
    expect(result).toEqual({ ok: false, errors: { password: "Use at most 128 characters." } });
  });

  it("asks for an email to resend to", () => {
    expect(parseForm(ResendVerificationSchema, { email: "" })).toEqual({
      ok: false,
      errors: { email: "Enter your email address." },
    });
  });
});

describe("sign-up inside an OIDC authorization request", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    // An admin creates the client the flow is for.
    const admin = h.browser("203.0.113.60");
    await admin.request("POST", "/api/auth/sign-up/email", {
      json: { email: "admin@example.com", password, name: "Admin" },
    });
    await admin.request("GET", linkIn(h.emails.at(-1)));
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    const client = await h.auth.api.adminCreateOAuthClient({
      body: { client_name: "Example app", redirect_uris: [redirectUri] },
      headers: new Headers({
        cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
      }),
    });
    clientId = client.client_id;
  });

  it("signs up, confirms by email, and lands back in the authorization at consent", async () => {
    const browser = h.browser("203.0.113.61");
    const verifier = randomBytes(32).toString("base64url");
    const authorizeQuery = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state: "st",
      nonce: "nn",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });

    // 1. No session: the provider sends the browser to the login page with a signed query.
    const authorize = await browser.request("GET", `/api/auth/oauth2/authorize?${authorizeQuery}`);
    const login = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(login.pathname).toBe(AUTH_PAGES.login);
    const signed = login.search.slice(1);

    // 2. The sign-up form, as SignUpForm sends it from /signup?<signed query>.
    const next = authorizeUrlFrom(signed) ?? "";
    const signUp = await browser.request("POST", "/api/auth/sign-up/email", {
      json: {
        email: "newcomer@example.com",
        password,
        name: "Newcomer",
        callbackURL: `${AUTH_PAGES.verifyEmail}?${new URLSearchParams({ next })}`,
        oauth_query: signed,
      },
    });
    expect(signUp.status).toBe(200);
    expect(browser.jar.size).toBe(0);

    // 3. The emailed link signs the user in and lands on /verify-email with `next`.
    const verify = await browser.request("GET", linkIn(h.emails.at(-1)));
    const landing = new URL(verify.headers.get("location") ?? "", BASE_URL);
    expect(landing.pathname).toBe(AUTH_PAGES.verifyEmail);
    expect(landing.searchParams.get("error")).toBeNull();
    expect([...browser.jar.keys()]).toContain("nvx-auth.session_token");

    // 4. The page sends them on to `next`: a fresh authorization request, which now has a
    //    session and continues to consent.
    const resume = safeReturnPath(landing.searchParams.get("next"));
    expect(resume).toBe(next);
    const resumed = await browser.request("GET", resume);
    const consent = new URL(resumed.headers.get("location") ?? "", BASE_URL);
    expect(consent.pathname).toBe(AUTH_PAGES.consent);
    expect(consent.searchParams.get("client_id")).toBe(clientId);
  });

  it("sends a tampered confirmation link to /verify-email with an error", async () => {
    const browser = h.browser("203.0.113.62");
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: {
        email: "tamper@example.com",
        password,
        name: "Tamper",
        callbackURL: `${AUTH_PAGES.verifyEmail}?next=%2Faccount%2Fsecurity`,
      },
    });
    const link = new URL(linkIn(h.emails.at(-1)));
    link.searchParams.set("token", `${link.searchParams.get("token")}x`);
    const response = await browser.request("GET", link.toString());
    const landing = new URL(response.headers.get("location") ?? "", BASE_URL);
    expect(landing.pathname).toBe(AUTH_PAGES.verifyEmail);
    expect(landing.searchParams.get("error")).toBeTruthy();
    expect(browser.jar.size).toBe(0);
  });

  it("answers a resend request alike for waiting, confirmed and unknown addresses", async () => {
    const resend = (email: string) =>
      h.browser("203.0.113.63").request("POST", "/api/auth/send-verification-email", {
        json: { email, callbackURL: `${AUTH_PAGES.verifyEmail}?next=%2F` },
      });
    const before = h.emails.length;
    const waiting = await resend("tamper@example.com");
    const confirmed = await resend("newcomer@example.com");
    const unknown = await resend("ghost@example.com");
    const bodies = await Promise.all([waiting, confirmed, unknown].map((r) => r.json()));
    expect([waiting.status, confirmed.status, unknown.status]).toEqual([200, 200, 200]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    // Only the address that's waiting gets a link.
    expect(h.emails.slice(before).map((email) => email.to)).toEqual(["tamper@example.com"]);
  });
});

describe("the sign-up actions' server side", () => {
  let h: Harness;
  beforeAll(async () => {
    h = await createHarness();
  });

  it("sends the link for a new address and an existing one alike, and says a field's problem", async () => {
    const call = h.browser("203.0.113.210").caller();
    const input = { name: "Ada", email: "ada@example.com", password };
    expect(await signUp(call, input, "/account/security")).toEqual({ kind: "sent" });
    expect(await signUp(call, input, "/account/security")).toEqual({ kind: "sent" });
    // The confirmation link goes on to /verify-email?next=… once Better Auth has checked it.
    expect(decodeURIComponent(linkIn(h.emails.at(-2)))).toContain(
      `${AUTH_PAGES.verifyEmail}?next=`,
    );
    expect(
      await signUp(call, { ...input, email: "short@example.com", password: "short" }, "/"),
    ).toEqual({ kind: "field", field: "password", message: "Use at least 12 characters." });
    expect(await resendVerification(call, "ada@example.com", "/")).toEqual({ kind: "sent" });
  });
});
