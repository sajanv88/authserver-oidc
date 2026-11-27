// nextidp for Fastify: signing people in to an app that renders its own pages, and protecting
// an API with a bearer token checked on each request. Fastify's request and reply wrap Node's,
// so nextidp's routes go through the Node bridge; the session's cookies go out through the
// reply, so they join whatever the route sets. Only Fastify's types are imported.
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { type AccessToken, type TokenRequirements, tokenRefusal } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isIdpError, isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";
import { nodeAdapter, type SessionOptions } from "./node-adapter.js";
import { pathOf, urlOf } from "./node-http.js";
import type { Session } from "./session.js";

/** A hook for a route's `onRequest` (or `preHandler`): it answers, or lets the request on. */
export type IdpHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export type FastifyIdp = Idp & {
  /**
   * The sign-in plugin, before your routes: `await app.register(auth.fastify())`. It answers
   * nextidp's routes under `basePath`, and for every other request reads the session
   * (refreshing the access token when it's about to expire) for `sessionOf(request)`. It
   * applies to the whole app, routes under a prefix included.
   */
  fastify(options?: SessionOptions): FastifyPluginAsync;
  /**
   * Lets a request through only with a session. Signed out, a GET or HEAD goes to sign in and
   * comes back after; anything else gets 401.
   *
   * ```ts
   * app.get("/dashboard", { onRequest: auth.requireSession() }, async (request) => {
   *   return `Hello, ${auth.sessionOf(request)?.user.name}`;
   * });
   * ```
   */
  requireSession(): IdpHook;
  /** The session read for this request, or null when signed out. */
  sessionOf(request: FastifyRequest): Session | null;
  /**
   * Lets a request through only with a valid access token that has every scope in
   * `requirements`. A refused one gets 401 or 403 with WWW-Authenticate (RFC 6750); one that
   * can't be checked now (the auth server is down) 503. Needs no plugin.
   *
   * ```ts
   * app.get("/orders", { onRequest: auth.requireToken({ scopes: ["orders:read"] }) }, async (request) => {
   *   return ordersOf(auth.tokenOf(request)?.subject);
   * });
   * ```
   */
  requireToken(requirements?: TokenRequirements): IdpHook;
  /** The access token `requireToken` checked for this request. */
  tokenOf(request: FastifyRequest): AccessToken | undefined;
};

function authorizationOf(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  return Array.isArray(value) ? undefined : value;
}

function isRead(method: string): boolean {
  const upper = method.toUpperCase();
  return upper === "GET" || upper === "HEAD";
}

/**
 * The client for a Fastify app or API. An app that signs people in needs the sign-in settings
 * (`IDP_ISSUER`, `IDP_CLIENT_ID`, `IDP_APP_URL`, `IDP_SECRET`); an API only `issuer` and
 * `audience`:
 *
 * ```ts
 * import Fastify from "fastify";
 * import { idp } from "nextidp/fastify";
 *
 * const auth = idp(); // the IDP_* environment variables, read on first use
 * const app = Fastify();
 * await app.register(auth.fastify());
 * ```
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): FastifyIdp {
  const core = createIdp(options);
  const node = nodeAdapter(core);
  // One session per request: a second read gets the first one's answer, never a second refresh.
  const sessions = new WeakMap<FastifyRequest, Promise<Session | null>>();
  const read = new WeakMap<FastifyRequest, Session | null>();
  const tokens = new WeakMap<FastifyRequest, AccessToken>();

  const sessionFor = (request: FastifyRequest, reply: FastifyReply, refresh = true) => {
    const known = sessions.get(request);
    if (known) return known;
    const reading = (async () => {
      const cookie = request.raw.headers.cookie;
      // A refresh rotates the refresh token: without a way to set the new cookie, the browser
      // would be left holding a dead one.
      if (!refresh || reply.sent) return core.getSession(cookie);
      const { session, setCookies, cookieHeader } = await core.refreshIfNeeded(cookie);
      // Through the reply, so they're added to the cookies the route sets, not replaced by them.
      for (const setCookie of setCookies) reply.header("set-cookie", setCookie);
      // Whatever reads the cookies later in this request sees the new ones.
      if (cookieHeader !== undefined) request.raw.headers.cookie = cookieHeader;
      return session;
    })();
    sessions.set(request, reading);
    return reading.then((session) => {
      read.set(request, session);
      return session;
    });
  };

  return {
    ...core,

    fastify({ refresh = true } = {}) {
      const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
        app.addHook("onRequest", async (request, reply) => {
          const { appUrl, basePath } = core.config();
          const { pathname } = urlOf(request.raw, appUrl);
          if (pathname === basePath || pathname.startsWith(`${basePath}/`)) {
            // nextidp answers these itself, on Node's response, its form read from the raw
            // request before Fastify would parse it (or refuse it: Fastify has no form parser).
            reply.hijack();
            await node.handle(request.raw, reply.raw);
            return;
          }
          await sessionFor(request, reply, refresh);
        });
      };
      // As fastify-plugin does: the hook applies to the whole app, not only this plugin's scope.
      Object.assign(plugin, { [Symbol.for("skip-override")]: true });
      return plugin;
    },

    requireSession() {
      return async (request, reply) => {
        const session = await sessionFor(request, reply);
        if (session) return;
        if (!isRead(request.method)) {
          await reply
            .code(401)
            .header("cache-control", "no-store")
            .type("text/plain; charset=utf-8")
            .send("Sign in first.");
          return;
        }
        const signIn = new URL(core.signInPath(pathOf(request.raw)), core.config().appUrl);
        // A refresh refused for good clears the cookie: that goes out with the redirect.
        await reply.header("cache-control", "no-store").redirect(signIn.toString(), 302);
      };
    },

    sessionOf(request) {
      const session = read.get(request);
      if (session === undefined) {
        throw new Error(
          "nextidp: no session was read for this request. Register auth.fastify() first.",
        );
      }
      return session;
    },

    requireToken(requirements = {}) {
      return async (request, reply) => {
        let token: AccessToken;
        try {
          token = await core.verifyBearer(authorizationOf(request), requirements);
        } catch (error) {
          if (isTokenError(error)) {
            const refusal = tokenRefusal(error);
            await reply.code(refusal.status).headers(refusal.headers).send(refusal.body);
            return;
          }
          // The auth server can't be reached, or a setting is wrong: never let the call through.
          request.log.error(
            `nextidp: a token couldn't be checked: ${isIdpError(error) ? error.code : "unexpected error"}`,
          );
          await reply.code(503).headers({ "retry-after": "5", "cache-control": "no-store" }).send({
            error: "temporarily_unavailable",
            error_description: "The token can't be checked now.",
          });
          return;
        }
        tokens.set(request, token);
      };
    },

    tokenOf: (request) => tokens.get(request),
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
export type { Idp, Refreshed, SignInPathOptions } from "./idp.js";
export type { SessionOptions } from "./node-adapter.js";
export type {
  InterceptableClient,
  ServiceTokenOptions,
  UseServiceTokenOptions,
} from "./service.js";
export type { IdpUser, Session } from "./session.js";
export { memoryStore, type SessionStore } from "./store.js";
