// Test-only helpers: a real createAuth() over a migrated PGlite database, driven through
// Better Auth's HTTP handler the way browsers and OIDC clients drive it.
import { createTestDb } from "@repo/db/testing";
import type { ServerEnv } from "@/shared/config/env";
import type { EmailContent, EmailMessage } from "@/shared/email";
import { createAuth } from "./auth-config";
import { type AuthCaller, callEndpoint } from "./endpoint";

export const BASE_URL = "http://auth.localtest.me:3000";
export const APP_ORIGIN = "http://app.localtest.me:3001";

export const testEnv: ServerEnv = {
  nodeEnv: "test",
  isProduction: false,
  databaseUrl: "postgres://unused",
  betterAuthSecret: "q3J8v1Zx9LmT0pR7sW2yN5cB4dF6gH8kTest",
  betterAuthUrl: BASE_URL,
  cookieDomain: ".localtest.me",
  trustedOrigins: [APP_ORIGIN],
  trustedProxies: ["10.0.0.0/8"],
  email: { provider: "console", from: "Auth <no-reply@localtest.me>" },
  turnstile: undefined,
  social: {},
  oauth: { resources: [], resourceLifetimes: {}, apiScopes: [] },
  tokenLifetimes: { accessToken: 10 * 60, idToken: 10 * 60, refreshToken: 30 * 24 * 60 * 60 },
  twoFactorRequiredForAdmins: false,
  appName: "Next-Identity Server",
  logoUrl: undefined,
};

/** `overrides` change the configuration, e.g. `{ turnstile: … }` to turn the captcha on. */
export async function createHarness(overrides: Partial<ServerEnv> = {}) {
  const database = await createTestDb();
  const emails: EmailMessage[] = [];
  // Rendered in order, after the response like the app's; each request waits for them, so a
  // test reads the email its request sent.
  let outbox: Promise<void> = Promise.resolve();
  const env = { ...testEnv, ...overrides };
  /** The app's sendEmailInBackground, for tests: `emails` has it once `settled()`. */
  const sendEmail = (to: string, email: Promise<EmailContent>) => {
    outbox = outbox.then(async () => {
      emails.push({ to, ...(await email) });
    });
  };
  const auth = createAuth({ env, database, sendEmail });
  /** Waits for the emails sent so far, outside a request (which waits by itself). */
  const settled = () => outbox;

  /** A browser: keeps cookies between requests, and always comes from the same client IP. */
  function browser(clientIp = "203.0.113.10") {
    const jar = new Map<string, string>();

    async function request(
      method: "GET" | "POST",
      path: string,
      options: {
        json?: unknown;
        form?: Record<string, string>;
        headers?: Record<string, string>;
      } = {},
    ): Promise<Response> {
      const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
      const headers = new Headers({
        origin: BASE_URL,
        // The client, then the ingress (a trusted proxy).
        "x-forwarded-for": `${clientIp}, 10.0.0.2`,
        ...options.headers,
      });
      if (jar.size > 0) {
        headers.set("cookie", [...jar].map(([name, value]) => `${name}=${value}`).join("; "));
      }
      let body: string | undefined;
      if (options.json !== undefined) {
        headers.set("content-type", "application/json");
        body = JSON.stringify(options.json);
      } else if (options.form) {
        headers.set("content-type", "application/x-www-form-urlencoded");
        body = new URLSearchParams(options.form).toString();
      }
      const response = await auth.handler(
        new Request(url, {
          method,
          headers,
          ...(body === undefined ? {} : { body }),
          redirect: "manual",
        }),
      );
      await outbox;
      for (const cookie of response.headers.getSetCookie()) {
        const [pair = ""] = cookie.split(";");
        const index = pair.indexOf("=");
        const name = pair.slice(0, index);
        const value = pair.slice(index + 1);
        if (value === "" || /max-age=0/i.test(cookie)) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    }

    /**
     * A server action's call on behalf of this browser (shared/auth/server-endpoint.ts): its
     * cookies and X-Forwarded-For go along, and the cookies Better Auth sets come back to it.
     * `forwardedFor` replaces what the ingress would send, to test forged headers.
     */
    function caller(options: { forwardedFor?: string } = {}): AuthCaller {
      return async (call) => {
        const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
        const result = await callEndpoint(
          auth,
          BASE_URL,
          { cookie, forwardedFor: options.forwardedFor ?? `${clientIp}, 10.0.0.2` },
          call,
        );
        for (const header of result.setCookies) {
          const [pair = ""] = header.split(";");
          const index = pair.indexOf("=");
          const name = pair.slice(0, index);
          const value = pair.slice(index + 1);
          if (value === "" || /max-age=0/i.test(header)) jar.delete(name);
          else jar.set(name, value);
        }
        return result;
      };
    }

    return { request, jar, caller };
  }

  /** Raw SQL against the test database, for setup the app itself never does (making an admin). */
  async function sql(query: string, params: unknown[] = []) {
    return database.$client.query(query, params);
  }

  return { auth, database, env, emails, sendEmail, settled, browser, sql };
}

export function linkIn(email: EmailMessage | undefined): string {
  const match = email?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error("no link in the email");
  return match[0];
}
