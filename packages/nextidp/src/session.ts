import type { JWTPayload } from "jose";
import * as v from "valibot";

// What this app keeps after a sign-in, and while one is in progress, each in an encrypted
// httpOnly cookie. Nothing here ever reaches the browser's JavaScript.

export const FLOW_PURPOSE = "nextidp:flow";
export const SESSION_PURPOSE = "nextidp:session";
/** A sign-in in progress lasts as long as the auth server's signed request: 10 minutes. */
export const FLOW_MAX_AGE = 600;

const FlowSchema = v.object({
  verifier: v.string(),
  state: v.string(),
  nonce: v.string(),
  returnTo: v.string(),
});
export type Flow = v.InferOutput<typeof FlowSchema>;

export function parseFlow(payload: unknown): Flow | undefined {
  const parsed = v.safeParse(FlowSchema, payload);
  return parsed.success ? parsed.output : undefined;
}

/**
 * What userinfo said about the person (the `userinfo` option): only these fields, so the
 * cookie stays small. Kept apart from `claims`, which are the ID token's alone.
 */
const ProfileSchema = v.object({
  email: v.optional(v.string()),
  email_verified: v.optional(v.boolean()),
  name: v.optional(v.string()),
  picture: v.optional(v.string()),
});
export type Profile = v.InferOutput<typeof ProfileSchema>;

/** A field longer than this is left out: a userinfo answer mustn't bloat the cookie. */
const MAX_PROFILE_TEXT = 1024;

function short(value: unknown): string | undefined {
  return typeof value === "string" && value && value.length <= MAX_PROFILE_TEXT ? value : undefined;
}

/** The profile fields of a userinfo answer, and nothing else; undefined if it has none. */
export function profileFrom(answer: Record<string, unknown>): Profile | undefined {
  const profile: Profile = {};
  const email = short(answer.email);
  const name = short(answer.name);
  const picture = short(answer.picture);
  if (email) profile.email = email;
  if (typeof answer.email_verified === "boolean") profile.email_verified = answer.email_verified;
  if (name) profile.name = name;
  if (picture) profile.picture = picture;
  return Object.keys(profile).length > 0 ? profile : undefined;
}

const StoredSessionSchema = v.object({
  claims: v.record(v.string(), v.unknown()),
  accessToken: v.string(),
  /** Seconds since the epoch. */
  accessTokenExpiresAt: v.number(),
  refreshToken: v.optional(v.string()),
  /** As received: the hint when signing out of the auth server too. */
  idToken: v.optional(v.string()),
  scope: v.optional(v.string()),
  /** From userinfo, when the `userinfo` option is on. */
  profile: v.optional(ProfileSchema),
});
export type StoredSession = v.InferOutput<typeof StoredSessionSchema>;

export function parseStoredSession(payload: unknown): StoredSession | undefined {
  const parsed = v.safeParse(StoredSessionSchema, payload);
  return parsed.success ? parsed.output : undefined;
}

/**
 * The person signed in, from the ID token's standard claims, and from userinfo with the
 * `userinfo` option (which wins where it has a value).
 */
export type IdpUser = {
  /** The `sub` claim: stable for this person at this auth server. */
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  picture?: string;
};

/** A signed-in session, as the app reads it. The refresh token stays inside nextidp. */
export type Session = {
  user: IdpUser;
  /** Every claim of the ID token, checked. */
  claims: JWTPayload;
  /** For calling APIs as this person: `Authorization: Bearer <accessToken>`. */
  accessToken: string;
  /** When the access token expires, in seconds since the epoch. */
  accessTokenExpiresAt: number;
  /** The scopes the auth server granted, when it said. */
  scope: string | undefined;
  /** Whether there's a refresh token: `offline_access` was granted. */
  canRefresh: boolean;
};

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

export function toSession(stored: StoredSession): Session {
  const claims = stored.claims as JWTPayload;
  const profile = stored.profile;
  const user: IdpUser = { id: String(claims.sub ?? "") };
  // The email and whether it's verified come as a pair, from one source: never one address
  // with the other's verification.
  const fromProfile = Boolean(text(profile?.email));
  const email = fromProfile ? text(profile?.email) : text(claims.email);
  const emailVerified = fromProfile ? profile?.email_verified : claims.email_verified;
  const name = text(profile?.name) ?? text(claims.name);
  const picture = text(profile?.picture) ?? text(claims.picture);
  if (email) user.email = email;
  if (typeof emailVerified === "boolean") user.emailVerified = emailVerified;
  if (name) user.name = name;
  if (picture) user.picture = picture;
  return {
    user,
    claims,
    accessToken: stored.accessToken,
    accessTokenExpiresAt: stored.accessTokenExpiresAt,
    scope: stored.scope,
    canRefresh: Boolean(stored.refreshToken),
  };
}
