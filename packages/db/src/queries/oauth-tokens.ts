import { and, eq, isNull } from "drizzle-orm";
import type { Executor } from "../executor";
import { oauthAccessTokens } from "../schema/oauth-access-tokens";
import { oauthRefreshTokens } from "../schema/oauth-refresh-tokens";

// Revoking every token apps hold for a user. @better-auth/oauth-provider revokes the tokens of
// a session when it ends, but keeps refresh tokens with `offline_access` (they're meant to
// outlive the sign-in), and has no call to revoke a user's tokens across apps. Marked revoked
// the way the plugin marks them, not deleted: the plugin refuses a revoked token, and a reused
// one still trips its replay check.

/** Marks every live access and refresh token of the user revoked. Returns how many. */
export async function revokeUserOAuthTokens(
  db: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const refresh = await tx
      .update(oauthRefreshTokens)
      .set({ revoked: now })
      .where(and(eq(oauthRefreshTokens.userId, userId), isNull(oauthRefreshTokens.revoked)))
      .returning({ id: oauthRefreshTokens.id });
    const access = await tx
      .update(oauthAccessTokens)
      .set({ revoked: now })
      .where(and(eq(oauthAccessTokens.userId, userId), isNull(oauthAccessTokens.revoked)))
      .returning({ id: oauthAccessTokens.id });
    return refresh.length + access.length;
  });
}
