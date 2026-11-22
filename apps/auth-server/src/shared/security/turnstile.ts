import "server-only";
import * as v from "valibot";
import type { ServerEnv, TurnstileConfig } from "@/shared/config/env";

// Checking a Turnstile token directly, for the one form that doesn't post to a Better Auth
// endpoint (the admin's "New client", which uses the plugin's server API). The auth endpoints
// are checked by Better Auth's captcha plugin instead (shared/auth/captcha.ts). Same rules:
// Cloudflare must accept the token (for this server's host, in production), and anything
// else refuses it.

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * The hosts a token must have been issued for: this server's, in production. None in
 * development, where Cloudflare's test keys report every token as issued for example.com.
 */
export function turnstileHostnames(
  env: Pick<ServerEnv, "isProduction" | "betterAuthUrl">,
): string[] | undefined {
  return env.isProduction ? [new URL(env.betterAuthUrl).hostname] : undefined;
}

const SiteverifySchema = v.object({
  success: v.boolean(),
  hostname: v.optional(v.string()),
});

/**
 * Whether Cloudflare accepts `token`, and issued it for one of `allowedHostnames` when that's
 * given (production; see turnstileHostnames). False on any failure.
 */
export async function verifyTurnstileToken(
  config: TurnstileConfig,
  token: string | undefined,
  allowedHostnames: string[] | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  if (!token) return false;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: config.secretKey, response: token }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const result = v.safeParse(SiteverifySchema, await response.json());
    if (!result.success || !result.output.success) return false;
    const { hostname } = result.output;
    return !allowedHostnames || (hostname !== undefined && allowedHostnames.includes(hostname));
  } catch {
    return false;
  }
}
