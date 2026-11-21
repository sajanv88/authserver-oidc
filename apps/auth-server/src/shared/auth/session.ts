import "server-only";
import type { Route } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getAuth } from "./auth";

export type AuthSession = NonNullable<Awaited<ReturnType<typeof readSession>>>;

async function readSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/** The signed-in session for this request, or null. Read once per request. */
export const getSession = cache(readSession);

/** A path that's safe to send someone back to after signing in: same site, no tricks. */
export function safeReturnPath(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : "/";
}

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
