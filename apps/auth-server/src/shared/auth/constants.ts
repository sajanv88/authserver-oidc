// Auth values shared by the Better Auth config (server) and proxy.ts. No imports: safe
// anywhere.

/** Prefix of every Better Auth cookie, so ours don't clash with other apps on the domain. */
export const AUTH_COOKIE_PREFIX = "nvx-auth";

export const LOGIN_PATH = "/login";

/** Pages that need a session. proxy.ts sends visitors without a session cookie to the login
 * page first; the pages still check the session themselves. */
export const PROTECTED_PATH_PREFIXES = ["/account", "/admin"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
