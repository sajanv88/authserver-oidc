import type { JWTPayload } from "jose";
import * as v from "valibot";
import { seal, unseal } from "./sealed-cookie";

// This app's own session after an OIDC sign-in, and the sign-in in progress, each in an
// encrypted httpOnly cookie. Nothing here is readable by the browser's JavaScript.

export const FLOW_PURPOSE = "oidc-flow";
export const SESSION_PURPOSE = "session";
/** The sign-in in progress lasts as long as the auth server's signed request: 10 minutes. */
export const FLOW_MAX_AGE = 600;
export const SESSION_MAX_AGE = 24 * 60 * 60;

export function cookieNames(isProduction: boolean) {
  return {
    // __Host-: Secure, Path=/, no Domain, so no sibling subdomain can set or read it.
    session: isProduction ? "__Host-example.session" : "example.session",
    // Scoped to /oidc, where the callback reads it; Secure in production.
    flow: isProduction ? "__Secure-example.oidc-flow" : "example.oidc-flow",
  };
}

const FlowSchema = v.object({ verifier: v.string(), state: v.string(), nonce: v.string() });
export type Flow = v.InferOutput<typeof FlowSchema>;

const SessionSchema = v.object({
  claims: v.record(v.string(), v.unknown()),
  accessToken: v.string(),
  /** Seconds since the epoch. */
  accessTokenExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
});
export type AppSession = Omit<v.InferOutput<typeof SessionSchema>, "claims"> & {
  claims: JWTPayload;
};

export function sealFlow(flow: Flow, secret: string): Promise<string> {
  return seal(flow, { secret, purpose: FLOW_PURPOSE, maxAgeSeconds: FLOW_MAX_AGE });
}

export async function unsealFlow(value: string | undefined, secret: string) {
  const payload = await unseal(value, { secret, purpose: FLOW_PURPOSE });
  const parsed = v.safeParse(FlowSchema, payload);
  return parsed.success ? parsed.output : undefined;
}

export function sealSession(session: AppSession, secret: string): Promise<string> {
  return seal(
    {
      claims: session.claims,
      accessToken: session.accessToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      ...(session.refreshToken ? { refreshToken: session.refreshToken } : {}),
    },
    { secret, purpose: SESSION_PURPOSE, maxAgeSeconds: SESSION_MAX_AGE },
  );
}

export async function unsealSession(
  value: string | undefined,
  secret: string,
): Promise<AppSession | undefined> {
  const payload = await unseal(value, { secret, purpose: SESSION_PURPOSE });
  const parsed = v.safeParse(SessionSchema, payload);
  return parsed.success ? (parsed.output as AppSession) : undefined;
}
