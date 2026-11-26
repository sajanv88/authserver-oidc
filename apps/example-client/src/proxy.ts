import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/features/oidc/server/auth";
import { authServerOrigin, buildContentSecurityPolicy, createNonce } from "@/shared/security/csp";

// Every document gets a fresh nonce and the Content-Security-Policy, as on the auth server.
function withContentSecurityPolicy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === "development",
    authServer: authServerOrigin(process.env),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

// nextidp first: it refreshes the access token before it expires and hands the page the new
// session; then the CSP.
export const proxy = auth.proxy({ next: withContentSecurityPolicy });

export const config = {
  matcher: [
    {
      // Documents only: not route handlers (/oidc/*, /api/health), static files or prefetches.
      source: "/((?!api/|oidc/|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
