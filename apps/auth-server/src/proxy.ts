import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_PREFIX, isProtectedPath, LOGIN_PATH } from "@/shared/auth/constants";
import { strayAuthCookieDeletions } from "@/shared/auth/stray-cookies";
import {
  buildContentSecurityPolicy,
  createNonce,
  isTurnstileConfigured,
  logoOrigin,
} from "@/shared/security/csp";

// Runs before every document request.
//
// 1. A protected page without a session cookie goes straight to the login page, coming back
//    afterwards. Only a convenience: the cookie isn't verified here, and every protected page
//    and action checks the real session itself (shared/auth/session.ts).
// 2. Everything else gets a fresh nonce and the Content-Security-Policy (shared/security/csp.ts).
//    Next reads the nonce from the request's CSP header and puts it on its own scripts; the
//    root layout reads x-nonce for anything else that needs it.
// 3. Either response expires the copies of our auth cookies that another cookie scope left
//    beside ours (shared/auth/stray-cookies.ts), when a name comes twice or a form is posted:
//    with two, the login page and the authorize endpoint read different sessions and send the
//    browser between them for ever.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const strays = strayAuthCookieDeletions({
    cookieHeader: request.headers.get("cookie"),
    method: request.method,
    // The issuer's host, not request.nextUrl's: that's the address the server listens on
    // (0.0.0.0 in the image), and the Host header is the client's to choose.
    hostname: issuerHostname(process.env.BETTER_AUTH_URL),
    cookieDomain: process.env.COOKIE_DOMAIN,
  });

  if (
    isProtectedPath(pathname) &&
    !getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })
  ) {
    const login = new URL(LOGIN_PATH, request.nextUrl);
    login.search = new URLSearchParams({ returnTo: `${pathname}${search}` }).toString();
    return withDeletions(NextResponse.redirect(login), strays);
  }

  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    turnstile: isTurnstileConfigured(process.env),
    logo: logoOrigin(process.env),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // For layouts, which can't see the URL: where to come back to after signing in. Always
  // overwritten here, and validated where it's read (safeReturnPath).
  requestHeaders.set("x-pathname", `${pathname}${search}`);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return withDeletions(response, strays);
}

function issuerHostname(issuer: string | undefined): string {
  return URL.parse(issuer ?? "")?.hostname ?? "";
}

// Raw headers, not response.cookies: that's keyed by name, so it can't expire a name on another
// domain beside a fresh one, and Next would also hand its changes to this request's cookies(),
// where the page or action would lose the session it's reading.
function withDeletions(response: NextResponse, deletions: string[]): NextResponse {
  for (const deletion of deletions) response.headers.append("set-cookie", deletion);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: not route handlers (/api/auth, /api/health and /api/ready included), static
      // files, image optimisation, or prefetches.
      source:
        "/((?!api/|_next/static|_next/image|favicon.ico|favicon.svg|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
