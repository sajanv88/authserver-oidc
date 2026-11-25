// Turning Better Auth's refusals into words for people. Never shows the server's own
// message: it's written for developers, and can say more than a visitor should learn.

export type AuthClientError = {
  status: number;
  code?: string | undefined;
  message?: string | undefined;
};

export const RATE_LIMITED_MESSAGE = "Too many attempts. Wait a minute, then try again.";

export const CAPTCHA_MESSAGE = "Complete the security check, then try again.";

/**
 * A disabled account's sign-in (the admin plugin's BANNED_USER). Better Auth refuses it when
 * it would start the session, after the password or the code was right, so saying so tells
 * only the account's owner.
 */
export const DISABLED_ACCOUNT_TEXT =
  "This account is disabled. If you think that's a mistake, ask your administrator.";

/** Whether Better Auth refused to sign a disabled account in. */
export function isDisabledAccount(error: AuthClientError): boolean {
  return error.code === "BANNED_USER";
}

/**
 * The captcha plugin's refusals: no token (400) or one Cloudflare didn't accept (403). It
 * checks before the endpoint runs, so this never says anything about an account.
 */
export function isCaptchaRefusal(error: AuthClientError): boolean {
  return (
    (error.status === 400 && error.code === "MISSING_RESPONSE") ||
    (error.status === 403 && error.code === "VERIFICATION_FAILED")
  );
}

/** The rate limiter's 429, the captcha's refusal, or the generic message for anything else. */
export function authErrorMessage(error: AuthClientError, fallback: string): string {
  if (error.status === 429) return RATE_LIMITED_MESSAGE;
  if (isCaptchaRefusal(error)) return CAPTCHA_MESSAGE;
  return fallback;
}
