import "server-only";
import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { env } from "@/shared/config/env";
import { SECURITY_PAGES } from "./account-pages";
import { getAuth } from "./auth";
import { safeReturnPath } from "./return-path";
import { mustSetUpTwoFactor, twoFactorRequired } from "./two-factor-policy";

export { safeReturnPath } from "./return-path";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof readSession>>>;

async function readSession() {
  // Per request, before anything reads env or the clock (Better Auth checks expiry with
  // new Date()): without it, dev's prerender check flags the session read.
  await connection();
  // The cookies as they stand now, not the Cookie header the request arrived with: a server
  // action that changes the session (a new password, two-factor turned on) sets a new session
  // cookie, and the page it re-renders must read that one. The old session is gone by then,
  // so the header's cookie would send the re-render to /login and lose the action's answer.
  const requestHeaders = new Headers(await headers());
  requestHeaders.set("cookie", (await cookies()).toString());
  return getAuth().api.getSession({ headers: requestHeaders });
}

/** The signed-in session for this request, or null. Read once per request. */
export const getSession = cache(readSession);

/**
 * The one page someone who must set up two-factor can open until it's on. Without a password
 * (signed up with a provider), it links to setting one through the reset email, which is an
 * auth page and open to anyone.
 */
const OPEN_BEFORE_TWO_FACTOR = new Set<string>([SECURITY_PAGES.twoFactor]);

function twoFactorPolicy() {
  return { requiredForAdmins: env().twoFactorRequiredForAdmins };
}

/** Whether this signed-in person must set up two-factor before anything else. */
export function mustSetUpTwoFactorNow(user: AuthSession["user"]): boolean {
  return mustSetUpTwoFactor(user, twoFactorPolicy());
}

/** Whether this signed-in person must have two-factor on (so they can't turn it off). */
export function twoFactorRequiredFor(user: AuthSession["user"]): boolean {
  return twoFactorRequired(user, twoFactorPolicy());
}

/**
 * The session, or a redirect to the login page that comes back to `returnTo`. For pages and
 * server actions: call it first, before reading or changing anything. Someone who must have
 * two-factor and hasn't set it up is sent to set it up, from every page but that one.
 */
export async function requireSession(returnTo = "/"): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    const query = new URLSearchParams({ returnTo: safeReturnPath(returnTo) });
    redirect(`/login?${query.toString()}` as Route);
  }
  const page = safeReturnPath(returnTo).split("?")[0] ?? "";
  if (mustSetUpTwoFactorNow(session.user) && !OPEN_BEFORE_TWO_FACTOR.has(page)) {
    redirect(SECURITY_PAGES.twoFactor as Route);
  }
  return session;
}

/** The session of an admin. Anyone else gets a 404: the admin area doesn't admit it exists. */
export async function requireAdmin(returnTo = "/"): Promise<AuthSession> {
  const session = await requireSession(returnTo);
  if (session.user.role !== "admin") notFound();
  return session;
}

/**
 * Redirects to a path taken from a query string or a header, after making it safe: anything
 * that isn't a same-site path becomes "/". The one place such a string is cast to a route.
 */
export function redirectToSafePath(value: unknown): never {
  redirect(safeReturnPath(value) as Route);
}
