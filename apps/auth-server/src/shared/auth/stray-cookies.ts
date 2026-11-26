// Duplicate auth cookies: what proxy.ts does when the browser sends one of our cookie names
// twice. Nothing server-only here: the proxy imports it.
import { AUTH_COOKIE_PREFIX } from "./constants";

const SECURE_PREFIX = "__Secure-";

function isAuthCookie(name: string): boolean {
  const bare = name.startsWith(SECURE_PREFIX) ? name.slice(SECURE_PREFIX.length) : name;
  return bare.startsWith(`${AUTH_COOKIE_PREFIX}.`);
}

/** How many times the Cookie header carries each of our cookie names. */
function authCookieCounts(cookieHeader: string | null): Map<string, number> {
  const seen = new Map<string, number>();
  for (const pair of (cookieHeader ?? "").split(";")) {
    const name = pair.split("=", 1)[0]?.trim() ?? "";
    if (isAuthCookie(name)) seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  return seen;
}

/** The domains above the host a cookie could have been set on: auth.example.com → example.com. */
function parentDomains(hostname: string): string[] {
  const host = hostname.toLowerCase();
  if (!host.includes(".") || host.includes(":") || /^[\d.]+$/.test(host)) return [];
  const labels = host.split(".");
  // Not the top-level domain alone: no cookie can be set there.
  return labels.slice(1, -1).map((_, i) => labels.slice(i + 1).join("."));
}

/**
 * `Set-Cookie` values that expire the copies of our auth cookies this server doesn't write.
 *
 * A browser sends every cookie whose domain matches, whatever port set it: another deployment
 * on a parent domain (one with COOKIE_DOMAIN, such as this project's own dev setup on
 * auth.localtest.me:3000), or this server before COOKIE_DOMAIN changed, leaves a second
 * `nvx-auth.session_token` beside ours. Better Auth's endpoints read the first of the two and
 * Next's `cookies()` the last, so the login page and the authorize endpoint disagree about the
 * session and send the browser back and forth for ever (and Next's router, once it's following
 * the redirects itself, keeps doing so from its cache).
 *
 * Our own copy is the one this server writes: on COOKIE_DOMAIN when it's set, else on the host
 * alone. Every other copy it can reach is expired: the host's when COOKIE_DOMAIN is set, and
 * each parent domain's but COOKIE_DOMAIN. Ours is never touched, so a fresh session survives.
 * Only `Path=/` copies are reachable; Better Auth writes nothing else.
 *
 * When: for a name the browser sends twice, and on a form post (a server action: signing in,
 * two-factor, consent) for every name it sends. One cookie alone doesn't say whose it is, but
 * the session a form post leaves is ours, so nothing in another scope may stay beside it.
 */
export function strayAuthCookieDeletions(request: {
  cookieHeader: string | null;
  method: string;
  hostname: string;
  cookieDomain: string | undefined;
}): string[] {
  const posted = request.method.toUpperCase() === "POST";
  const names = [...authCookieCounts(request.cookieHeader)]
    .filter(([, count]) => posted || count > 1)
    .map(([name]) => name);
  if (names.length === 0) return [];
  const ours = request.cookieDomain?.trim().toLowerCase().replace(/^\./, "") || undefined;
  const scopes: (string | undefined)[] = [
    ...(ours ? [undefined] : []),
    ...parentDomains(request.hostname).filter((domain) => domain !== ours),
  ];
  return names.flatMap((name) =>
    scopes.map((domain) =>
      [
        `${name}=`,
        "Path=/",
        ...(domain ? [`Domain=${domain}`] : []),
        "Max-Age=0",
        "HttpOnly",
        "SameSite=Lax",
        ...(name.startsWith(SECURE_PREFIX) ? ["Secure"] : []),
      ].join("; "),
    ),
  );
}
