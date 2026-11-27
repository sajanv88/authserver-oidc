// nextidp for Hono, on any runtime Hono runs on (Cloudflare Workers, Bun, Deno, Node, Vercel
// Edge): the sign-in routes, the session on the context, refreshed before it expires, and the
// bearer token check for APIs. Hono speaks Web Request and Response, as the core does, so this
// is a thin layer. Only Hono's types are imported: nothing of Hono's is bundled.
import type { Context, MiddlewareHandler } from "hono";
import type { AccessToken, TokenRequirements } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isIdpError, isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";
import type { Session } from "./session.js";

/**
 * The context variables nextidp sets: `session` (by `middleware()`, null when signed out) and
 * `token` (by `requireToken()`). Give it to your app: `new Hono<IdpEnv>()`.
 */
export type IdpEnv = { Variables: { session: Session | null; token: AccessToken } };

export type HonoSessionOptions = {
  /** Refresh the access token when it expires within a minute (default true). */
  refresh?: boolean;
};

export type HonoIdp = Idp & {
  /** nextidp's routes, for `app.all("/auth/*", auth.routes())` (under `basePath`). */
  routes(): (c: Context) => Promise<Response>;
  /**
   * Reads the session for every request (refreshing the access token when it's about to
   * expire, with the new cookie on the response) and puts it on the context:
   * `c.get("session")`, null when signed out. `app.use(auth.middleware())`.
   */
  middleware(options?: HonoSessionOptions): MiddlewareHandler<IdpEnv>;
  /**
   * Lets a request through only with a session. Signed out, a GET or HEAD goes to sign in and
   * comes back after; anything else gets 401.
   */
  requireSession(): MiddlewareHandler<IdpEnv>;
  /**
   * Lets a request through only with a valid access token that has every scope in
   * `requirements`, put on the context as `c.get("token")`. A refused one gets 401 or 403 with
   * WWW-Authenticate (RFC 6750); one that can't be checked now (the auth server is down) 503.
   */
  requireToken(requirements?: TokenRequirements): MiddlewareHandler<IdpEnv>;
};

/**
 * Adds Set-Cookie headers to the response the handler made. A refreshed session's cookie must
 * reach the browser, or it keeps a refresh token the auth server has rotated away.
 */
function putCookies(c: Context, cookies: readonly string[]): void {
  if (cookies.length === 0) return;
  try {
    for (const cookie of cookies) c.res.headers.append("set-cookie", cookie);
  } catch {
    // Its headers can't be changed (a Response from fetch): send a copy. Hono's setter would
    // merge the old response's cookies over the copy's, so it's cleared first.
    const copy = new Response(c.res.body, c.res);
    for (const cookie of cookies) copy.headers.append("set-cookie", cookie);
    c.res = undefined;
    c.res = copy;
  }
}

function underBasePath(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

/**
 * The client for a Hono app or API:
 *
 * ```ts
 * import { Hono } from "hono";
 * import { idp, type IdpEnv } from "nextidp/hono";
 *
 * const auth = idp({ issuer: "https://auth.example.com", clientId: "…", appUrl: "…", secret: "…" });
 * const app = new Hono<IdpEnv>();
 * app.all("/auth/*", auth.routes());
 * app.use(auth.middleware());
 * app.get("/dashboard", auth.requireSession(), (c) => c.text(`Hello, ${c.get("session")?.user.name}`));
 * ```
 *
 * On a runtime without `process.env` (Cloudflare Workers), pass the settings, or `env`:
 * `idp(() => ({ env: workerEnv }))`.
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): HonoIdp {
  const core = createIdp(options);

  const sessionOf = async (c: Context<IdpEnv>, refresh: boolean) => {
    if (!refresh) return { session: await core.getSession(c.req.raw), setCookies: [] };
    const { session, setCookies } = await core.refreshIfNeeded(c.req.raw);
    return { session, setCookies };
  };

  return {
    ...core,

    routes: () => (c) => core.handler(c.req.raw),

    middleware({ refresh = true } = {}) {
      return async (c, next) => {
        // nextidp's own routes read and write the cookies themselves.
        if (underBasePath(new URL(c.req.url).pathname, core.config().basePath)) {
          await next();
          return;
        }
        const { session, setCookies } = await sessionOf(c, refresh);
        c.set("session", session);
        await next();
        putCookies(c, setCookies);
      };
    },

    requireSession() {
      return async (c, next) => {
        const known = c.get("session");
        const { session, setCookies } =
          known === undefined ? await sessionOf(c, true) : { session: known, setCookies: [] };
        if (session) {
          c.set("session", session);
          await next();
          putCookies(c, setCookies);
          return;
        }
        const method = c.req.method.toUpperCase();
        if (method !== "GET" && method !== "HEAD") {
          c.res = c.text("Sign in first.", 401, { "cache-control": "no-store" });
        } else {
          const url = new URL(c.req.url);
          const signIn = new URL(
            core.signInPath(`${url.pathname}${url.search}`),
            core.config().appUrl,
          );
          c.res = c.redirect(signIn.toString(), 302);
          c.res.headers.set("cache-control", "no-store");
        }
        // A refresh refused for good clears the cookie: that goes out with the refusal.
        putCookies(c, setCookies);
      };
    },

    requireToken(requirements = {}) {
      return async (c, next) => {
        let token: AccessToken;
        try {
          token = await core.verifyBearer(c.req.header("authorization"), requirements);
        } catch (error) {
          if (isTokenError(error)) return core.tokenErrorResponse(error);
          // The auth server can't be reached, or a setting is wrong: never let the call through.
          console.error(
            `nextidp: a token couldn't be checked: ${isIdpError(error) ? error.code : "unexpected error"}`,
          );
          return c.json(
            {
              error: "temporarily_unavailable",
              error_description: "The token can't be checked now.",
            },
            503,
            { "retry-after": "5", "cache-control": "no-store" },
          );
        }
        c.set("token", token);
        await next();
        return undefined;
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
export type {
  InterceptableClient,
  ServiceTokenOptions,
  UseServiceTokenOptions,
} from "./service.js";
export type { IdpUser, Session } from "./session.js";
export { memoryStore, type SessionStore } from "./store.js";
