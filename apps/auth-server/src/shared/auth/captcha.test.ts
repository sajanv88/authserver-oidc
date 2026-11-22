import { describe, expect, it } from "vitest";
import { authErrorMessage, CAPTCHA_MESSAGE, isCaptchaRefusal } from "./auth-errors";
import { CAPTCHA_FIELD, captchaToken, withCaptcha } from "./captcha";
import type { EndpointCall, EndpointResult } from "./endpoint";

const ok: EndpointResult = { ok: true, data: {}, status: 200, setCookies: [] };

describe("the Turnstile token on its way to Better Auth", () => {
  it("reads the widget's field, and nothing when it's missing or empty", () => {
    const form = new FormData();
    expect(captchaToken(form)).toBeUndefined();
    form.set(CAPTCHA_FIELD, "");
    expect(captchaToken(form)).toBeUndefined();
    form.set(CAPTCHA_FIELD, "token-from-the-widget");
    expect(captchaToken(form)).toBe("token-from-the-widget");
  });

  it("adds the token to each call, and leaves calls alone without one", async () => {
    const calls: EndpointCall[] = [];
    const caller = async (call: EndpointCall) => {
      calls.push(call);
      return ok;
    };
    await withCaptcha(caller, "abc")({ path: "/sign-in/email", body: { email: "a@b.c" } });
    await withCaptcha(caller, undefined)({ path: "/sign-in/email" });
    expect(calls).toEqual([
      { path: "/sign-in/email", body: { email: "a@b.c" }, captcha: "abc" },
      { path: "/sign-in/email" },
    ]);
  });
});

describe("a captcha refusal, in words", () => {
  it("asks to complete the check for a missing or rejected token", () => {
    const missing = { status: 400, code: "MISSING_RESPONSE" };
    const rejected = { status: 403, code: "VERIFICATION_FAILED" };
    expect(isCaptchaRefusal(missing)).toBe(true);
    expect(isCaptchaRefusal(rejected)).toBe(true);
    expect(authErrorMessage(missing, "fallback")).toBe(CAPTCHA_MESSAGE);
    expect(authErrorMessage(rejected, "fallback")).toBe(CAPTCHA_MESSAGE);
  });

  it("leaves other refusals to their own messages", () => {
    expect(isCaptchaRefusal({ status: 403, code: "EMAIL_NOT_VERIFIED" })).toBe(false);
    expect(authErrorMessage({ status: 500, code: "UNKNOWN_ERROR" }, "fallback")).toBe("fallback");
  });
});
