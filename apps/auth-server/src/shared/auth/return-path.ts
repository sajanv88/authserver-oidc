/**
 * A path that's safe to send someone back to after signing in: on this site only. Anything
 * else (another origin, a protocol-relative `//host`, a `/\host` that browsers treat the same,
 * a non-string) becomes "/". Every `returnTo` from a query string or header goes through this.
 */
export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}
