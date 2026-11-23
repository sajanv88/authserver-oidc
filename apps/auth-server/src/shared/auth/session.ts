import "server-only";
import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { getAuth } from "./auth";
import { safeReturnPath } from "./return-path";

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
 * The session, or a redirect to the login page that comes back to `returnTo`. For pages and
 * server actions: call it first, before reading or changing anything.
 */
export async function requireSession(returnTo = "/"): Promise<AuthSession> {
  const session = await getSession();
  if (!session) {
    const query = new URLSearchParams({ returnTo: safeReturnPath(returnTo) });
    redirect(`/login?${query.toString()}` as Route);
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
