// The social sign-in feature: where its buttons send the browser, what a returning ?error=
// says, and starting a sign-in against the real auth configuration with Google configured.
// The whole round trip through a provider is in shared/auth/social-sign-in.test.ts.
import { beforeAll, describe, expect, it } from "vitest";
import { RATE_LIMITED_MESSAGE } from "@/shared/auth/auth-errors";
import { TWO_FACTOR_REQUIRED_ERROR } from "@/shared/auth/social-two-factor-guard";
import { createHarness } from "@/shared/auth/test-harness";
import { socialProblem } from "./server/problems";
import { socialTargets, startSocialSignIn } from "./server/social-sign-in";

describe("where a provider's sign-in comes back to", () => {
  it("outside an app: returnTo (or the account), and failures to /login with it", () => {
    expect(socialTargets("", "/admin/clients")).toEqual({
      callbackURL: "/admin/clients",
      errorCallbackURL: "/login?returnTo=%2Fadmin%2Fclients",
    });
    expect(socialTargets("", "/")).toEqual({
      callbackURL: "/account/security",
      errorCallbackURL: "/login",
    });
  });

  it("inside an app's flow: failures come back to /login with the signed request", () => {
    const signed = "client_id=app&response_type=code&sig=abc";
    expect(socialTargets(signed, "/").errorCallbackURL).toBe(`/login?${signed}`);
  });
});

describe("what a returning error says", () => {
  it("explains the codes it knows", () => {
    expect(socialProblem(TWO_FACTOR_REQUIRED_ERROR).title).toBe("Two-factor authentication is on");
    expect(socialProblem("email_not_verified").title).toBe("Confirm your email first");
    expect(socialProblem("unable_to_link_account")).toEqual(socialProblem("account_not_linked"));
  });

  it("never repeats anything else back, not even an inherited property name", () => {
    const general = socialProblem("something_new");
    expect(general.text).toContain("couldn't sign you in");
    expect(socialProblem("<script>alert(1)</script>")).toEqual(general);
    expect(socialProblem("constructor")).toEqual(general);
  });
});

describe("starting a sign-in with Google", () => {
  let h: Awaited<ReturnType<typeof createHarness>>;

  beforeAll(async () => {
    h = await createHarness({
      social: { google: { clientId: "google-client", clientSecret: "google-secret" } },
    });
  });

  const targets = { callbackURL: "/account/security", errorCallbackURL: "/login" };

  it("returns Google's address, and leaves the state cookie with the browser", async () => {
    const browser = h.browser("192.0.2.1");
    const outcome = await startSocialSignIn(
      browser.caller(),
      { provider: "google", ...targets },
      "",
    );
    expect(outcome.kind).toBe("redirect");
    const url = new URL(outcome.kind === "redirect" ? outcome.url : "");
    expect(url.hostname).toBe("accounts.google.com");
    expect(url.searchParams.get("client_id")).toBe("google-client");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect([...browser.jar.keys()].some((name) => name.includes("state"))).toBe(true);
  });

  it("refuses a provider that isn't configured", async () => {
    const outcome = await startSocialSignIn(
      h.browser("192.0.2.2").caller(),
      { provider: "github", ...targets },
      "",
    );
    expect(outcome.kind).toBe("failed");
  });

  it("is rate limited per client: the 11th start in a minute is refused", async () => {
    const browser = h.browser("192.0.2.3");
    for (let i = 0; i < 10; i++) {
      await startSocialSignIn(browser.caller(), { provider: "google", ...targets }, "");
    }
    expect(
      await startSocialSignIn(browser.caller(), { provider: "google", ...targets }, ""),
    ).toEqual({ kind: "failed", message: RATE_LIMITED_MESSAGE });
  });
});
