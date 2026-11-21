import "server-only";
import { headers } from "next/headers";
import { connection } from "next/server";
import * as v from "valibot";
import { env } from "@/shared/config/env";

// The shared session: the auth server sets its session cookie on the parent domain
// (COOKIE_DOMAIN=.localtest.me), so the browser sends it to this app too. This app can't read
// or verify it itself; it asks the auth server, forwarding only the auth server's own cookies.

/**
 * Only the auth server's cookies from a Cookie header: `<prefix>.*`, and the `__Secure-` /
 * `__Host-` forms production uses. This app's own cookies never leave it.
 */
export function authCookieHeader(cookieHeader: string | null, prefix: string): string {
  if (!cookieHeader) return "";
  const own = [`${prefix}.`, `__Secure-${prefix}.`, `__Host-${prefix}.`];
  return cookieHeader
    .split(";")
    .map((pair) => pair.trim())
    .filter((pair) => own.some((start) => pair.startsWith(start)))
    .join("; ");
}

const SessionSchema = v.object({
  user: v.object({
    name: v.string(),
    email: v.string(),
    emailVerified: v.optional(v.boolean()),
  }),
  session: v.object({ expiresAt: v.string() }),
});

export type SharedSession =
  | { status: "signed-in"; name: string; email: string; expiresAt: string }
  | { status: "signed-out" }
  /** The auth server didn't answer: not the same as signed out. */
  | { status: "unavailable" };

/** Who the shared cookie signs in, according to the auth server's get-session. */
export async function getSharedSession(): Promise<SharedSession> {
  await connection();
  const config = env();
  const cookie = authCookieHeader((await headers()).get("cookie"), config.authCookiePrefix);
  if (!cookie) return { status: "signed-out" };
  try {
    const response = await fetch(`${config.authServerUrl}/api/auth/get-session`, {
      headers: { cookie, accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { status: "unavailable" };
    const parsed = v.safeParse(SessionSchema, await response.json());
    if (!parsed.success) return { status: "signed-out" };
    return {
      status: "signed-in",
      name: parsed.output.user.name,
      email: parsed.output.user.email,
      expiresAt: parsed.output.session.expiresAt,
    };
  } catch {
    return { status: "unavailable" };
  }
}
