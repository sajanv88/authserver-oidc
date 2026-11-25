// The two-factor feature against the real auth configuration (PGlite), over HTTP. Codes come
// from a separate RFC 6238 implementation, as an authenticator app would compute them from the
// QR code's otpauth:// URI, so this also checks that real apps work.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { setupKeyFrom } from "./components/two-factor-settings/setup-key";
import { VerifyBackupCodeSchema, VerifyTotpSchema } from "./schemas/two-factor";
import { continueAfterSetup } from "./server/continue";
import {
  confirmSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  startSetup,
  verifySecondFactor,
} from "./server/two-factor";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

/** The current code for an otpauth:// URI (RFC 6238, SHA-1, as the URI says). */
function totp(uri: string, at = Date.now()): string {
  const url = new URL(uri);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...(url.searchParams.get("secret") ?? "").toUpperCase()]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const period = Number(url.searchParams.get("period") ?? 30);
  const digits = Number(url.searchParams.get("digits") ?? 6);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}

describe("two-factor form rules and setup key", () => {
  it("takes six digits, or a backup code with its dash and case", () => {
    expect(parseForm(VerifyTotpSchema, { code: " 123456 " })).toMatchObject({
      ok: true,
      value: { code: "123456" },
    });
    expect(parseForm(VerifyTotpSchema, { code: "12345" })).toMatchObject({ ok: false });
    expect(parseForm(VerifyBackupCodeSchema, { code: "Ab3dE-f9Hk2", trustDevice: "on" })).toEqual({
      ok: true,
      value: { code: "Ab3dE-f9Hk2", trustDevice: true },
    });
    expect(parseForm(VerifyBackupCodeSchema, { code: "Ab3dEf9Hk2" })).toMatchObject({ ok: false });
  });

  it("shows the URI's secret as a typeable setup key", () => {
    expect(setupKeyFrom("otpauth://totp/A:b?secret=jbswy3dpehpk3pxp&issuer=A")).toBe(
      "JBSW Y3DP EHPK 3PXP",
    );
    expect(setupKeyFrom("not a uri")).toBe("");
  });
});

describe("two-factor sign-in", () => {
  let h: Harness;
  let clientId = "";
  let totpURI = "";
  let backupCodes: string[] = [];

  async function signUp(email: string, ip: string): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    return browser;
  }

  function signIn(browser: Browser, extra: Record<string, unknown> = {}) {
    return browser.request("POST", "/api/auth/sign-in/email", {
      json: { email: "ada@example.com", password, ...extra },
    });
  }

  beforeAll(async () => {
    h = await createHarness();
    const admin = await signUp("admin@example.com", "203.0.113.100");
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    clientId = (
      await h.auth.api.adminCreateOAuthClient({
        body: { client_name: "Example app", redirect_uris: [redirectUri] },
        headers: new Headers({
          cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
        }),
      })
    ).client_id;

    // Ada turns two-factor on, as EnableDialog does: password, then a code from the app.
    const ada = await signUp("ada@example.com", "203.0.113.101");
    const wrongPassword = await ada.request("POST", "/api/auth/two-factor/enable", {
      json: { password: "not my password!" },
    });
    // The code PasswordForm turns into "That isn't your password."
    expect(((await wrongPassword.json()) as { code?: string }).code).toBe("INVALID_PASSWORD");
    const enable = (await (
      await ada.request("POST", "/api/auth/two-factor/enable", { json: { password } })
    ).json()) as { totpURI: string; backupCodes: string[] };
    totpURI = enable.totpURI;
    backupCodes = enable.backupCodes;
    const wrongCode = await ada.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: "000000" },
    });
    expect(((await wrongCode.json()) as { code?: string }).code).toBe("INVALID_CODE");
    const confirm = await ada.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: totp(totpURI) },
    });
    expect(confirm.status).toBe(200);
    const { rows } = await h.sql("select two_factor_enabled from users where email = $1", [
      "ada@example.com",
    ]);
    expect(rows).toEqual([{ two_factor_enabled: true }]);
  });

  it("inside an app's flow, the second factor continues to consent", async () => {
    const browser = h.browser("203.0.113.102");
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
    const signed = login.search.slice(1);

    const first = await signIn(browser, { oauth_query: signed });
    expect(await first.json()).toMatchObject({ twoFactorRedirect: true });
    expect([...browser.jar.keys()]).not.toContain("nvx-auth.session_token");

    // VerifyForm on /two-factor?<signed query>: the client sends the query along.
    const verify = await browser.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: totp(totpURI), oauth_query: signed },
    });
    const answer = (await verify.json()) as { redirect?: boolean; url?: string };
    expect(answer.redirect).toBe(true);
    expect(new URL(answer.url ?? "", BASE_URL).pathname).toBe(AUTH_PAGES.consent);
  });

  it("takes each backup code once", async () => {
    const code = backupCodes[0] ?? "";
    const first = h.browser("203.0.113.103");
    await signIn(first);
    const used = await first.request("POST", "/api/auth/two-factor/verify-backup-code", {
      json: { code },
    });
    expect(used.status).toBe(200);
    expect([...first.jar.keys()]).toContain("nvx-auth.session_token");

    const second = h.browser("203.0.113.104");
    await signIn(second);
    const again = await second.request("POST", "/api/auth/two-factor/verify-backup-code", {
      json: { code },
    });
    expect(((await again.json()) as { code?: string }).code).toBe("INVALID_BACKUP_CODE");
  });

  it('with "don\'t ask again", skips the second factor on that device only', async () => {
    const trusted = h.browser("203.0.113.105");
    await signIn(trusted);
    await trusted.request("POST", "/api/auth/two-factor/verify-totp", {
      json: { code: totp(totpURI), trustDevice: true },
    });
    await trusted.request("POST", "/api/auth/sign-out", { json: {} });

    const again = await signIn(trusted);
    expect(await again.json()).not.toHaveProperty("twoFactorRedirect");
    expect([...trusted.jar.keys()]).toContain("nvx-auth.session_token");

    const elsewhere = await signIn(h.browser("203.0.113.106"));
    expect(await elsewhere.json()).toMatchObject({ twoFactorRedirect: true });
  });

  it("refuses verification without a pending sign-in", async () => {
    const response = await h
      .browser("203.0.113.107")
      .request("POST", "/api/auth/two-factor/verify-totp", { json: { code: totp(totpURI) } });
    // The code VerifyForm turns into "Your sign-in timed out".
    expect(((await response.json()) as { code?: string }).code).toBe("INVALID_TWO_FACTOR_COOKIE");
  });
});

describe("the two-factor actions' server side, as the actions call it", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
    const admin = h.browser("203.0.113.200");
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

  it("settings: start with the password, confirm with a code, new codes, then off", async () => {
    const grace = h.browser("203.0.113.201");
    await grace.request("POST", "/api/auth/sign-up/email", {
      json: { email: "grace@example.com", password, name: "Grace" },
    });
    await grace.request("GET", linkIn(h.emails.at(-1)));
    const call = grace.caller();

    expect(await startSetup(call, "not my password", 1)).toEqual({
      ok: false,
      failure: { attempt: 1, error: "That isn't your password." },
    });
    const started = await startSetup(call, password, 2);
    if (!started.ok) throw new Error("expected setup to start");
    expect(started.backupCodes).toHaveLength(10);

    expect(await confirmSetup(call, "000000")).toMatchObject({ ok: false });
    expect(await confirmSetup(call, totp(started.totpURI))).toEqual({ ok: true });
    const { rows } = await h.sql("select two_factor_enabled from users where email = $1", [
      "grace@example.com",
    ]);
    expect(rows).toEqual([{ two_factor_enabled: true }]);

    const fresh = await regenerateBackupCodes(call, password, 3);
    if (!fresh.ok) throw new Error("expected new codes");
    expect(fresh.backupCodes).not.toEqual(started.backupCodes);

    expect(await disableTwoFactor(call, "not my password", 4)).toMatchObject({ ok: false });
    expect(await disableTwoFactor(call, password, 5)).toEqual({ ok: true });

    // The sign-in step, while it was on, is covered below; turn it on again for that.
    const again = await startSetup(call, password, 6);
    if (!again.ok) throw new Error("expected setup to start again");
    await confirmSetup(call, totp(again.totpURI));

    // Sign-in step: a wrong code is the field's; the right one continues the app's flow.
    const browser = h.browser("203.0.113.202");
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
    await browser.caller()({
      path: "/sign-in/email",
      body: { email: "grace@example.com", password },
      oauthQuery: signed,
    });

    const wrong = await verifySecondFactor(
      browser.caller(),
      { method: "totp", code: "000000", trustDevice: false },
      signed,
    );
    expect(wrong).toMatchObject({ kind: "field" });
    const right = await verifySecondFactor(
      browser.caller(),
      { method: "totp", code: totp(again.totpURI), trustDevice: false },
      signed,
    );
    if (right.kind !== "continue") throw new Error(`expected continue, got ${right.kind}`);
    expect(new URL(right.url, BASE_URL).pathname).toBe(AUTH_PAGES.consent);
  });

  it("the sign-in step without a pending sign-in says it expired", async () => {
    expect(
      await verifySecondFactor(
        h.browser("203.0.113.203").caller(),
        { method: "backup", code: "Ab3dE-f9Hk2", trustDevice: false },
        "",
      ),
    ).toEqual({ kind: "problem", problem: { kind: "expired" } });
  });
});

describe("required two-factor inside an app's sign-in", () => {
  it("sends someone to set it up, then goes on to the app once a real code turns it on", async () => {
    const h = await createHarness();
    const admin = h.browser("203.0.113.150");
    await admin.request("POST", "/api/auth/sign-up/email", {
      json: { email: "admin@example.com", password, name: "Admin" },
    });
    await admin.request("GET", linkIn(h.emails.at(-1)));
    await h.sql("update users set role = 'admin' where email = $1", ["admin@example.com"]);
    const { client_id } = await h.auth.api.adminCreateOAuthClient({
      body: { client_name: "App", redirect_uris: [redirectUri], skip_consent: true },
      headers: new Headers({
        cookie: [...admin.jar].map(([name, value]) => `${name}=${value}`).join("; "),
      }),
    });

    const ada = h.browser("203.0.113.151");
    await ada.request("POST", "/api/auth/sign-up/email", {
      json: { email: "ada@example.com", password, name: "Ada" },
    });
    await ada.request("GET", linkIn(h.emails.at(-1)));
    await h.sql("update users set two_factor_required = true where email = $1", [
      "ada@example.com",
    ]);

    const query = new URLSearchParams({
      response_type: "code",
      client_id,
      redirect_uri: redirectUri,
      scope: "openid email",
      state: "st",
      code_challenge: createHash("sha256").update(randomBytes(16)).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await ada.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const setUp = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    expect(setUp.pathname).toBe("/account/security/two-factor");
    const signed = setUp.search.slice(1);

    expect(await continueAfterSetup(ada.caller(), signed)).toEqual({ kind: "not-yet" });

    const started = await startSetup(ada.caller(), password, 1);
    if (!started.ok) throw new Error("setup didn't start");
    expect(await confirmSetup(ada.caller(), totp(started.totpURI))).toEqual({ ok: true });

    const outcome = await continueAfterSetup(ada.caller(), signed);
    if (outcome.kind !== "continue") throw new Error(`expected to continue, got ${outcome.kind}`);
    const callback = new URL(outcome.url);
    expect(`${callback.origin}${callback.pathname}`).toBe(redirectUri);
    expect(callback.searchParams.get("code")).toBeTruthy();

    // A query that no longer verifies asks the app's request again instead.
    const tampered = signed.replace("state=st", "state=xx");
    expect(await continueAfterSetup(ada.caller(), tampered)).toMatchObject({
      kind: "restart",
      url: expect.stringContaining("/api/auth/oauth2/authorize?"),
    });
  });
});
