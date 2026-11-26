// nextidp for Express (and anything with Connect-style middleware on Node's own request and
// response: Express's req and res extend them). For now, protecting an API: a bearer token
// checked on each request, with its scopes.
import type { IncomingMessage, ServerResponse } from "node:http";
import { type AccessToken, type TokenRequirements, tokenRefusal } from "./access-token.js";
import type { IdpOptions } from "./config.js";
import { isTokenError } from "./errors.js";
import { createIdp, type Idp } from "./idp.js";

/** A request that passed `requireToken`: `req.idp.token` is the checked access token. */
export type IdpRequest = IncomingMessage & { idp?: { token: AccessToken } };

export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
) => void;

export type ExpressIdp = Idp & {
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

/**
 * The client for an Express app or API. For an API, `issuer` and `audience` are all it needs:
 *
 * ```ts
 * import { idp } from "nextidp/express";
 * export const auth = idp({ issuer: "https://auth.example.com", audience: "https://api.example.com" });
 * ```
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): ExpressIdp {
  const core = createIdp(options);
  return {
    ...core,

    requireToken(requirements = {}) {
      return (req, res, next) => {
        core.verifyBearer(authorizationOf(req), requirements).then(
          (token) => {
            (req as IdpRequest).idp = { token };
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
export type { ApiConfig, IdpOptions } from "./config.js";
export { IdpError, isIdpError, isTokenError, type TokenErrorCode } from "./errors.js";
export type { Idp } from "./idp.js";
