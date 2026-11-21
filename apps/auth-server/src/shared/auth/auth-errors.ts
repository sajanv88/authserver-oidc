// Turning Better Auth client errors into words for people. Never shows the server's own
// message: it's written for developers, and can say more than a visitor should learn.

/** The shape of `error` in what `authClient.*` calls resolve to. */
export type AuthClientError = {
  status: number;
  code?: string | undefined;
  message?: string | undefined;
};

export const RATE_LIMITED_MESSAGE = "Too many attempts. Wait a minute, then try again.";

/** The rate limiter's 429, or the generic message for anything else. */
export function authErrorMessage(error: AuthClientError, fallback: string): string {
  return error.status === 429 ? RATE_LIMITED_MESSAGE : fallback;
}
