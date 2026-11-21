// The password-reset feature: its form rules, what its pages make of their query, and the
// whole round trip against the real auth configuration (PGlite) over HTTP.
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { mismatchErrors, ResetPasswordSchema } from "./schemas/password-reset";
import { forgotPasswordPageContext, resetPasswordPageContext } from "./server/pages";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const newPassword = "a brand new passphrase";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("reset form rules", () => {
  it("needs 12+ characters, typed the same twice", () => {
    expect(parseForm(ResetPasswordSchema, { password: "short", confirmPassword: "" })).toEqual({
      ok: false,
      errors: {
        password: "Use at least 12 characters.",
        confirmPassword: "Type the new password again.",
      },
    });
    const parsed = parseForm(ResetPasswordSchema, {
      password: newPassword,
      confirmPassword: "other one",
    });
    if (!parsed.ok) throw new Error("expected each field to pass on its own");
    expect(mismatchErrors(parsed.value)).toEqual({
      confirmPassword: "The passwords don't match. Type the same password twice.",
    });
    expect(mismatchErrors({ password: newPassword, confirmPassword: newPassword })).toEqual({});
  });
});

describe("page contexts", () => {
  it("forgot-password: resumes an app's flow, else a safe returnTo, else the account", () => {
    const signed = { response_type: "code", client_id: "abc", redirect_uri: redirectUri, sig: "x" };
    expect(forgotPasswordPageContext(signed).next).toMatch(/^\/api\/auth\/oauth2\/authorize\?/);
    expect(forgotPasswordPageContext({ returnTo: "/admin/clients" }).next).toBe("/admin/clients");
    expect(forgotPasswordPageContext({ returnTo: "//evil.example" }).next).toBe(
      "/account/security",
    );
    expect(forgotPasswordPageContext({ returnTo: "/admin/clients" }).loginHref).toBe(
      "/login?returnTo=%2Fadmin%2Fclients",
    );
  });

  it("reset-password: ready with a token, invalid with an error or none, next made safe", () => {
    expect(resetPasswordPageContext({ token: "t", next: "/account/security" })).toMatchObject({
      status: "ready",
      token: "t",
      next: "/account/security",
    });
    expect(resetPasswordPageContext({ token: "t", next: "https://evil.example" })).toMatchObject({
      next: "/",
    });
    expect(resetPasswordPageContext({ error: "INVALID_TOKEN", next: "/" }).status).toBe("invalid");
    expect(resetPasswordPageContext({ next: "/" }).status).toBe("invalid");
  });
});

describe("resetting a password inside an app's sign-in", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.80");
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

  it("emails a link back to /reset-password with next, resets once, and resumes the flow", async () => {
    // A confirmed user, signed in on another device.
    const other = h.browser("203.0.113.81");
    await other.request("POST", "/api/auth/sign-up/email", {
      json: { email: "ada@example.com", password, name: "Ada" },
    });
    await other.request("GET", linkIn(h.emails.at(-1)));
    expect(await h.auth.api.getSession({ headers: cookies(other.jar) })).not.toBeNull();

    // An app sends the browser to sign in; they follow "Forgot your password?".
    const browser = h.browser("203.0.113.82");
    const authorize = await browser.request(
      "GET",
      `/api/auth/oauth2/authorize?${authorizeQuery(clientId)}`,
    );
    const login = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    const { next } = forgotPasswordPageContext(Object.fromEntries(login.searchParams));

    // ForgotPasswordForm's request; the email's link lands on /reset-password.
    await browser.request("POST", "/api/auth/request-password-reset", {
      json: {
        email: "ada@example.com",
        redirectTo: `${AUTH_PAGES.resetPassword}?${new URLSearchParams({ next })}`,
      },
    });
    const landed = new URL(
      (await browser.request("GET", linkIn(h.emails.at(-1)))).headers.get("location") ?? "",
      BASE_URL,
    );
    expect(landed.pathname).toBe(AUTH_PAGES.resetPassword);
    const context = resetPasswordPageContext(Object.fromEntries(landed.searchParams));
    if (context.status !== "ready") throw new Error("expected a good link");
    expect(context.next).toBe(next);

    // ResetPasswordForm's request: once only, and every other session is gone.
    const reset = await browser.request("POST", "/api/auth/reset-password", {
      json: { token: context.token, newPassword },
    });
    expect(reset.status).toBe(200);
    const again = await browser.request("POST", "/api/auth/reset-password", {
      json: { token: context.token, newPassword: "yet another passphrase" },
    });
    expect(again.status).toBe(400);
    expect(await h.auth.api.getSession({ headers: cookies(other.jar) })).toBeNull();

    // Continue: the fresh authorization request asks to sign in, and the new password works.
    const resumed = await browser.request("GET", context.next);
    const freshLogin = new URL(resumed.headers.get("location") ?? "", BASE_URL);
    expect(freshLogin.pathname).toBe(AUTH_PAGES.login);
    const signIn = await browser.request("POST", "/api/auth/sign-in/email", {
      json: {
        email: "ada@example.com",
        password: newPassword,
        oauth_query: freshLogin.search.slice(1),
      },
    });
    const answer = (await signIn.json()) as { url?: string };
    expect(new URL(answer.url ?? "", BASE_URL).pathname).toBe(AUTH_PAGES.consent);

    const oldPassword = await h.browser("203.0.113.83").request("POST", "/api/auth/sign-in/email", {
      json: { email: "ada@example.com", password },
    });
    expect(oldPassword.status).toBe(401);
  });

  it("sends a tampered link to /reset-password with an error, keeping next", async () => {
    const browser = h.browser("203.0.113.84");
    await browser.request("POST", "/api/auth/request-password-reset", {
      json: {
        email: "admin@example.com",
        redirectTo: `${AUTH_PAGES.resetPassword}?next=%2Faccount%2Fsecurity`,
      },
    });
    const link = new URL(linkIn(h.emails.at(-1)));
    link.pathname = `${link.pathname}x`;
    const landed = new URL(
      (await browser.request("GET", link.toString())).headers.get("location") ?? "",
      BASE_URL,
    );
    expect(landed.pathname).toBe(AUTH_PAGES.resetPassword);
    expect(landed.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(resetPasswordPageContext(Object.fromEntries(landed.searchParams))).toMatchObject({
      status: "invalid",
    });
  });
});

function cookies(jar: Map<string, string>): Headers {
  return new Headers({ cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ") });
}

function authorizeQuery(clientId: string): URLSearchParams {
  return new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state: "st",
    code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
    code_challenge_method: "S256",
  });
}
