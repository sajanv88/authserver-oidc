import { index, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./_columns";
import { oauthClients } from "./oauth-clients";
import { sessions } from "./sessions";
import { users } from "./users";

// @better-auth/oauth-provider, model "oauthRefreshToken". Tokens are stored hashed and rotate
// on every use: `rotatedAt` marks a spent token, and presenting it again revokes the family.
export const oauthRefreshTokens = snakeCase.table(
  "oauth_refresh_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    token: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    // The session the token was issued from. It outlives the session, so it's only cleared.
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
    revoked: timestamptz(),
    rotatedAt: timestamptz(),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: timestamptz(),
    authTime: timestamptz(),
    confirmation: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("oauth_refresh_tokens_token_key").on(t.token),
    index("oauth_refresh_tokens_client_id_idx").on(t.clientId),
    index("oauth_refresh_tokens_session_id_idx").on(t.sessionId),
    index("oauth_refresh_tokens_user_id_idx").on(t.userId),
    index("oauth_refresh_tokens_authorization_code_id_idx").on(t.authorizationCodeId),
  ],
);
