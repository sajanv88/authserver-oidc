// nextidp for Express (and anything with Connect-style middleware on Node's own request and
// response: Express's req and res extend them). Signing people in to an app that renders its
// own pages, and protecting an API: a bearer token checked on each request, with its scopes.
import type { IncomingMessage, ServerResponse } from "node:http";
import { type AccessToken, type TokenRequirements, tokenRefusal } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";
import { nodeAdapter, type SessionOptions } from "./node-adapter.js";
import type { Session } from "./session.js";

/**
 * A request nextidp's middleware saw: `req.idp.session` after `auth.express()` (null when
 * signed out), `req.idp.token` after `requireToken`.
 */
export type IdpRequest = IncomingMessage & {
  idp?: { session?: Session | null; token?: AccessToken };
};

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

export type ExpressIdp = Idp & {
  /**
   * The sign-in middleware, once, before your routes: `app.use(auth.express())`. It answers
   * nextidp's routes under `basePath`, and for every other request reads the session
   * (refreshing the access token when it's about to expire) for `sessionOf(req)`.
   */
  express(options?: SessionOptions): Middleware;
  /**
   * Lets a request through only with a session. Signed out, a GET or HEAD goes to sign in and
   * comes back after; anything else gets 401.
   *
   * ```ts
   * app.get("/dashboard", auth.requireSession(), (req, res) => {
   *   res.render("dashboard", { user: auth.sessionOf(req)?.user });
   * });
   * ```
   */
  requireSession(): Middleware;
  /** The session `express()` read for this request, or null when signed out. */
  sessionOf(req: IncomingMessage): Session | null;
  /**
   * Middleware that lets a request through only with a valid access token that has every
   * scope in `requirements`. A refused one gets 401 or 403 with WWW-Authenticate (RFC 6750);
   * a token that can't be checked now (the auth server is down) goes to `next(error)`.
   *
   * ```ts
   * app.get("/orders", auth.requireToken({ scopes: ["orders:read"] }), (req, res) => {
   *   res.json(ordersOf(auth.tokenOf(req)?.subject));
   * });
   * ```
   */
  requireToken(requirements?: TokenRequirements): Middleware;
  /** The access token `requireToken` checked for this request. */
  tokenOf(req: IncomingMessage): AccessToken | undefined;
};

function authorizationOf(req: IncomingMessage): string | undefined {
  const value = req.headers.authorization;
  return Array.isArray(value) ? undefined : value;
}

function remember(req: IncomingMessage, found: { session?: Session | null; token?: AccessToken }) {
  const request = req as IdpRequest;
  request.idp = { ...request.idp, ...found };
}

/**
 * The client for an Express app or API. An app that signs people in needs the sign-in
 * settings (`IDP_ISSUER`, `IDP_CLIENT_ID`, `IDP_APP_URL`, `IDP_SECRET`); an API only `issuer`
 * and `audience`:
 *
 * ```ts
 * import { idp } from "nextidp/express";
 * export const auth = idp(); // the IDP_* environment variables, read on first use
 * ```
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): ExpressIdp {
  const core = createIdp(options);
  const node = nodeAdapter(core);
  return {
    ...core,

    express(sessionOptions = {}) {
      return (req, res, next) => {
        const run = async () => {
          if (await node.handle(req, res)) return true;
          remember(req, { session: await node.session(req, res, sessionOptions) });
          return false;
        };
        run().then((answered) => {
          if (!answered) next();
        }, next);
      };
    },

    requireSession() {
      return (req, res, next) => {
        node.session(req, res).then((session) => {
          if (!session) {
            node.turnAway(req, res);
            return;
          }
          remember(req, { session });
          next();
        }, next);
      };
    },

    sessionOf(req) {
      const session = (req as IdpRequest).idp?.session;
      if (session === undefined) {
        throw new Error(
          "nextidp: no session was read for this request. Mount auth.express() first.",
        );
      }
      return session;
    },

    requireToken(requirements = {}) {
      return (req, res, next) => {
        core.verifyBearer(authorizationOf(req), requirements).then(
          (token) => {
            remember(req, { token });
            next();
          },
          (error: unknown) => {
            if (!isTokenError(error)) {
              next(error);
              return;
            }
            const refusal = tokenRefusal(error);
            res.statusCode = refusal.status;
            for (const [name, value] of Object.entries(refusal.headers)) res.setHeader(name, value);
            res.end(JSON.stringify(refusal.body));
          },
        );
      };
    },

    tokenOf: (req) => (req as IdpRequest).idp?.token,
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
export type { SessionOptions } from "./node-adapter.js";
export type {
  InterceptableClient,
  ServiceTokenOptions,
  UseServiceTokenOptions,
} from "./service.js";
export type { IdpUser, Session } from "./session.js";
