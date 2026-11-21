import "server-only";
import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { env } from "@/shared/config/env";
import { getAuth } from "./auth";
import { type AuthCaller, callEndpoint } from "./endpoint";
import { safeReturnPath } from "./return-path";

/**
 * Runs a Better Auth endpoint from a server action, for the browser that sent the action: its
 * cookies, client IP (X-Forwarded-For as the ingress set it) and user agent go along, and the
 * cookies Better Auth sets come back to it through `cookies()`.
 */
export const callAuth: AuthCaller = async (call) => {
  const incoming = await headers();
  const result = await callEndpoint(
    getAuth(),
    env().betterAuthUrl,
    {
      cookie: incoming.get("cookie"),
      forwardedFor: incoming.get("x-forwarded-for"),
      userAgent: incoming.get("user-agent"),
    },
    call,
  );
  if (result.setCookies.length > 0) {
    const jar = await cookies();
    for (const header of result.setCookies) {
      for (const [name, attributes] of parseSetCookieHeader(header)) {
        jar.set(name, attributes.value, toCookieOptions(attributes));
      }
    }
  }
  return result;
};

/**
 * Goes on to where an auth step leads. A page of this server: a server redirect. Another site
 * (an app's redirect URI): returned, for the form to navigate to. A server redirect there would
 * be blocked after a form POST by `form-action 'self'`, and without JavaScript the page shows a
 * link to it instead.
 */
export function continueTo(url: string): { away: string } {
  const base = new URL(env().betterAuthUrl);
  const target = new URL(url, base);
  if (target.origin === base.origin) {
    redirect(safeReturnPath(`${target.pathname}${target.search}`) as Route);
  }
  return { away: target.toString() };
}
