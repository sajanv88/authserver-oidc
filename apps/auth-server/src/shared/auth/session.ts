import "server-only";
import type { Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";
import { safeReturnPath } from "./return-path";

export { safeReturnPath } from "./return-path";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof readSession>>>;

async function readSession() {
  // Request headers first: that's what makes the page dynamic, before anything reads env.
  const requestHeaders = await headers();
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
