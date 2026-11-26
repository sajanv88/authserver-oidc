// nextidp for Node's own HTTP server (node:http, or anything that hands you its req and res):
// the sign-in routes, and the session, refreshed before it expires.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IdpOptions } from "./config.js";
import { createIdp, type Idp } from "./idp.js";
import { nodeAdapter, type SessionOptions } from "./node-adapter.js";
import type { Session } from "./session.js";

export type NodeIdp = Idp & {
  /**
   * Answers nextidp's routes (`<basePath>/login`, `/callback`, `/logout`, `/refresh`) and
   * returns true; any other path is left to you, and it returns false.
   */
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  /**
   * The signed-in session, or null. Refreshes the access token first when it's about to
   * expire, setting the new cookie on `res`, so call it before you start the response. Read
   * twice in one request, it answers the same.
   */
  session(
    req: IncomingMessage,
    res: ServerResponse,
    options?: SessionOptions,
  ): Promise<Session | null>;
  /**
   * The session; or, signed out, a redirect to sign in that comes back to `returnTo` (default:
   * this request's path) for GET and HEAD, or 401 for anything else. Then it's null and the
   * response is sent.
   */
  requireSession(
    req: IncomingMessage,
    res: ServerResponse,
    returnTo?: string,
  ): Promise<Session | null>;
};

/**
 * The client for an app on Node's own HTTP server:
 *
 * ```ts
 * import { createServer } from "node:http";
 * import { idp } from "nextidp/node";
 *
 * const auth = idp(); // the IDP_* environment variables, read on first use
 *
 * createServer(async (req, res) => {
 *   if (await auth.handle(req, res)) return;
 *   const session = await auth.requireSession(req, res);
 *   if (!session) return;
 *   res.end(`Hello, ${session.user.name}`);
 * }).listen(3000);
 * ```
 */
export function idp(options?: IdpOptions | (() => IdpOptions)): NodeIdp {
  const core = createIdp(options);
  const node = nodeAdapter(core);
  return {
    ...core,
    handle: node.handle,
    session: node.session,
    async requireSession(req, res, returnTo) {
      const session = await node.session(req, res);
      if (!session) node.turnAway(req, res, returnTo);
      return session;
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
export type { SessionOptions } from "./node-adapter.js";
export type { InterceptableClient, ServiceTokenOptions } from "./service.js";
export type { IdpUser, Session } from "./session.js";
