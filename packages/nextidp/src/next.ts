// nextidp for Next.js (App Router): the routes, a proxy that protects pages and refreshes
// tokens, and the session in server components and actions.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection, NextRequest, NextResponse } from "next/server";
import type { AccessToken, TokenRequirements } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";
import type { Session } from "./session.js";

export type ProxyOptions = {
  /**
   * Pages that need a session: a signed-out visitor goes to sign in, and comes back after.
   * Path prefixes (`/dashboard` covers `/dashboard/…`), or a function of the pathname.
   */
  protect?: readonly string[] | ((pathname: string) => boolean);
  /** Refresh the access token before it expires (default true). */
  refresh?: boolean;
  /**
   * The rest of your proxy. It gets the request with the refreshed cookies; to hand them to
   * the page, pass its headers on: `NextResponse.next({ request: { headers: request.headers } })`.
   */
  next?: (request: NextRequest) => Response | Promise<Response>;
};

export type NextIdp = Idp & {
  /** For `app/<basePath>/[...nextidp]/route.ts`: `export const { GET, POST } = auth.routes();` */
  routes(): {
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  };
  /** The session in a server component, server action or route handler; null if signed out. */
  session(): Promise<Session | null>;
  /** The session, or a redirect to sign in that comes back to `returnTo` (a path). */
  requireSession(returnTo?: string): Promise<Session>;
  /** For `proxy.ts`: `export const proxy = auth.proxy({ protect: ["/dashboard"] });` */
  proxy(options?: ProxyOptions): (request: NextRequest) => Promise<Response>;
  /**
   * A route handler of an API: the bearer token is checked (and its scopes) before `handler`
   * runs, which gets it as `context.token`. A refused token gets 401 or 403.
   *
   * ```ts
   * export const GET = auth.withToken({ scopes: ["orders:read"] }, async (request, { token }) =>
   *   Response.json(await ordersOf(token.subject)),
   * );
   * ```
   */
  withToken<Context extends object = object>(
    requirements: TokenRequirements,
    handler: (
      request: NextRequest,
      context: Context & { token: AccessToken },
    ) => Response | Promise<Response>,
  ): (request: NextRequest, context: Context) => Promise<Response>;
};

function isProtected(protect: ProxyOptions["protect"], pathname: string): boolean {
  if (!protect) return false;
  if (typeof protect === "function") return protect(pathname);
  return protect.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * The client for a Next.js app. Call it once, in a module of its own, and import the result:
 *
 * ```ts
 * import { idp } from "nextidp/next";
 * export const auth = idp();  // the IDP_* environment variables, read on first use
 * ```
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): NextIdp {
  const core = createIdp(options);

  const handle = async (request: Request) => {
    // Never prerendered: every answer depends on this request.
    await connection();
    return core.handler(request);
  };

  const session = async () => {
    await connection();
    return core.getSession((await cookies()).toString());
  };

  return {
    ...core,

    routes: () => ({ GET: handle, POST: handle }),

    session,

    async requireSession(returnTo) {
      const current = await session();
      if (!current) redirect(core.signInPath(returnTo));
      return current;
    },

    withToken(requirements, handler) {
      return async (request, context) => {
        let token: AccessToken;
        try {
          token = await core.verifyBearer(request.headers.get("authorization"), requirements);
        } catch (error) {
          if (isTokenError(error)) return core.tokenErrorResponse(error);
          // The auth server can't be reached, or a setting is wrong: never let the call through.
          console.error("nextidp: a token couldn't be checked", error);
          return Response.json(
            {
              error: "temporarily_unavailable",
              error_description: "The token can't be checked now.",
            },
            { status: 503, headers: { "retry-after": "5", "cache-control": "no-store" } },
          );
        }
        return handler(request, { ...context, token });
      };
    },

    proxy(options = {}) {
      return async (request) => {
        const config = core.config();
        const { pathname, search } = request.nextUrl;
        const pass = (forward: NextRequest) =>
          options.next
            ? options.next(forward)
            : NextResponse.next({ request: { headers: forward.headers } });

        // nextidp's own routes read and write the cookies themselves.
        if (pathname === config.basePath || pathname.startsWith(`${config.basePath}/`)) {
          return pass(request);
        }

        const { session, setCookies, cookieHeader } =
          options.refresh === false
            ? { session: await core.getSession(request), setCookies: [], cookieHeader: undefined }
            : await core.refreshIfNeeded(request);

        let response: Response;
        if (!session && isProtected(options.protect, pathname)) {
          response = NextResponse.redirect(
            new URL(core.signInPath(`${pathname}${search}`), config.appUrl),
          );
        } else if (cookieHeader === undefined) {
          response = await pass(request);
        } else {
          // The page renders with the refreshed session, not the one the browser sent.
          const headers = new Headers(request.headers);
          headers.set("cookie", cookieHeader);
          response = await pass(new NextRequest(request, { headers }));
        }
        for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
        return response;
      };
    },
  };
}

export type { AccessToken, TokenRequirements } from "./access-token.js";
export type { ApiConfig, IdpConfig, IdpOptions } from "./config.js";
export {
  IdpError,
  type IdpErrorCode,
  isIdpError,
  isSignInErrorCode,
  isTokenError,
  SIGN_IN_ERROR_CODES,
  type SignInErrorCode,
  type TokenErrorCode,
} from "./errors.js";
export type { Idp, Refreshed } from "./idp.js";
export type { IdpUser, Session } from "./session.js";
