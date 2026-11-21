// Auth values shared by the Better Auth config (server), proxy.ts and the forms. Nothing
// server-only here: safe anywhere.
import { AUTH_PAGES } from "./auth-pages";

/** Prefix of every Better Auth cookie, so ours don't clash with other apps on the domain. */
export const AUTH_COOKIE_PREFIX = "nvx-auth";

export const LOGIN_PATH = AUTH_PAGES.login;

/** Password length rules, enforced by Better Auth and checked first by the forms. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/** Pages that need a session. proxy.ts sends visitors without a session cookie to the login
 * page first; the pages still check the session themselves. */
export const PROTECTED_PATH_PREFIXES = ["/account", "/admin"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
