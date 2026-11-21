// The package's public surface for apps: the database, inferred types, query functions and
// the Better Auth adapter. Never the pool, never drizzle-kit, and not the tables: queries live
// in this package. drizzle-kit reads the tables through the "./schema" export instead.

export { type AuthAdapter, createAuthAdapter } from "./auth-adapter";
export { type Db, db } from "./client";
export type { Executor } from "./executor";
export {
  getOAuthClientPublicInfo,
  listOAuthClients,
  type OAuthClientPublicInfo,
  type OAuthClientSummary,
} from "./queries/oauth-clients";
export { getSessionToken, listActiveSessions, type SessionSummary } from "./queries/sessions";
export { getUserSecurityByEmail, type UserSecurity } from "./queries/users";
export type { OAuthClient } from "./schema/oauth-clients";
export type { Session } from "./schema/sessions";
export type { User, UserRole } from "./schema/users";
