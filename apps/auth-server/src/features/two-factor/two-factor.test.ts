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
