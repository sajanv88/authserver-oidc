import type { BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Executor } from "./executor";
import {
  accounts,
  jwks,
  oauthAccessTokens,
  oauthClientAssertions,
  oauthClientResources,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  oauthResources,
  rateLimits,
  sessions,
  twoFactors,
  users,
  verifications,
} from "./schema";

// Better Auth's model names → our tables. Keys must match the model names Better Auth and its
// plugins use (getAuthTables), not the SQL table names.
const authSchema = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
  rateLimit: rateLimits,
  twoFactor: twoFactors,
  jwks,
  oauthClient: oauthClients,
  oauthResource: oauthResources,
  oauthClientResource: oauthClientResources,
  oauthAccessToken: oauthAccessTokens,
  oauthRefreshToken: oauthRefreshTokens,
  oauthConsent: oauthConsents,
  oauthClientAssertion: oauthClientAssertions,
};

export type AuthAdapter = ReturnType<typeof drizzleAdapter>;

/**
 * The Better Auth database adapter over this package's tables, so the app's `betterAuth()`
 * never imports drizzle-orm or the tables itself: `database: createAuthAdapter(db)`.
 *
 * The primary keys are uuid columns, so Better Auth must run with
 * `advanced.database.generateId: "uuid"`. Anything else would fail on the first insert;
 * this fails at startup instead.
 */
export function createAuthAdapter(database: Executor): AuthAdapter {
  const adapter = drizzleAdapter(database, {
    provider: "pg",
    schema: authSchema,
    transaction: true,
  });
  return (options: BetterAuthOptions) => {
    if (options.advanced?.database?.generateId !== "uuid") {
      throw new Error(
        'createAuthAdapter: set advanced.database.generateId to "uuid" (the tables use uuid ids)',
      );
    }
    return adapter(options);
  };
}
