import type { AuthCaller } from "./endpoint";

// Cloudflare Turnstile, when it's configured (TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY).
// The widget in each form (shared/ui/turnstile) puts its token in a hidden field; the form's
// server action passes it on with withCaptcha, and Better Auth's captcha plugin checks it on
// the endpoints below (auth-config.ts). The plugin guards the endpoints themselves, so a bot
// that skips the forms and posts to /api/auth directly is refused too.

/** The hidden field the Turnstile widget fills in. */
export const CAPTCHA_FIELD = "cf-turnstile-response";

/**
 * Every Better Auth endpoint a form of this server posts to with what someone typed: each of
 * those forms shows the widget. Not the buttons-only ones (sign out, revoke a session,
 * consent): they need a session already, and Next checks their Origin.
 */
export const CAPTCHA_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/magic-link",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/enable",
  "/two-factor/disable",
  "/two-factor/generate-backup-codes",
  "/change-password",
];

/** The token a form posted, or undefined (no widget, or JavaScript off). */
export function captchaToken(form: FormData): string | undefined {
  const value = form.get(CAPTCHA_FIELD);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** `call`, sending `token` with every endpoint call it makes. */
export function withCaptcha(call: AuthCaller, token: string | undefined): AuthCaller {
  return token ? (endpointCall) => call({ ...endpointCall, captcha: token }) : call;
}
