import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_PREFIX, isProtectedPath, LOGIN_PATH } from "@/shared/auth/constants";
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
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (
    isProtectedPath(pathname) &&
    !getSessionCookie(request, { cookiePrefix: AUTH_COOKIE_PREFIX })
  ) {
    const login = new URL(LOGIN_PATH, request.nextUrl);
    login.search = new URLSearchParams({ returnTo: `${pathname}${search}` }).toString();
    return NextResponse.redirect(login);
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
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: not route handlers (/api/auth and /api/health included), static
      // files, image optimisation, or prefetches.
      source: "/((?!api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
