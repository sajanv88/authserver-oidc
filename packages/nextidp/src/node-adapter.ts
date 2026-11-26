// Sign-in on Node's own request and response: what nextidp/node and nextidp/express share.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Idp } from "./idp.js";
import {
  appendSetCookies,
  BodyTooLarge,
  pathOf,
  sendText,
  sendWebResponse,
  toWebRequest,
  urlOf,
} from "./node-http.js";
import type { Session } from "./session.js";

export type SessionOptions = {
  /**
   * Refresh the access token when it expires within a minute (default true). Needs the
   * response's headers unsent, to set the new cookie: once they're sent, it only reads.
   */
  refresh?: boolean;
};

export type NodeAdapter = {
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  session(
    req: IncomingMessage,
    res: ServerResponse,
    options?: SessionOptions,
  ): Promise<Session | null>;
  turnAway(req: IncomingMessage, res: ServerResponse, returnTo?: string): void;
};

export function nodeAdapter(core: Idp): NodeAdapter {
  // One session per request: a second read gets the first one's answer, never a second refresh.
  const sessions = new WeakMap<IncomingMessage, Promise<Session | null>>();

  return {
    async handle(req, res) {
      const { appUrl, basePath } = core.config();
      const { pathname } = urlOf(req, appUrl);
      if (pathname !== basePath && !pathname.startsWith(`${basePath}/`)) return false;
      let request: Request;
      try {
        request = await toWebRequest(req, appUrl);
      } catch (error) {
        if (!(error instanceof BodyTooLarge)) throw error;
        res.setHeader("connection", "close");
        sendText(res, 413, "Payload too large");
        return true;
      }
      await sendWebResponse(res, await core.handler(request));
      return true;
    },

    session(req, res, { refresh = true } = {}) {
      const known = sessions.get(req);
      if (known) return known;
      const read = (async () => {
        // A refresh rotates the refresh token: without a way to set the new cookie, the
        // browser would be left holding a dead one.
        if (!refresh || res.headersSent) return core.getSession(req.headers.cookie);
        const { session, setCookies, cookieHeader } = await core.refreshIfNeeded(
          req.headers.cookie,
        );
        appendSetCookies(res, setCookies);
        // Whatever reads the cookies later in this request sees the new ones.
        if (cookieHeader !== undefined) req.headers.cookie = cookieHeader;
        return session;
      })();
      sessions.set(req, read);
      return read;
    },

    turnAway(req, res, returnTo = pathOf(req)) {
      const method = (req.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        sendText(res, 401, "Sign in first.");
        return;
      }
      const { appUrl } = core.config();
      res.statusCode = 302;
      res.setHeader("location", new URL(core.signInPath(returnTo), appUrl).toString());
      res.setHeader("cache-control", "no-store");
      res.end();
    },
  };
}
