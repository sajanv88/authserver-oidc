import { index, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./_columns";
import { oauthClients } from "./oauth-clients";
import { oauthRefreshTokens } from "./oauth-refresh-tokens";
import { sessions } from "./sessions";
import { users } from "./users";

// @better-auth/oauth-provider, model "oauthAccessToken": opaque access tokens (stored hashed).
// JWT access tokens, issued for a resource, are not stored.
export const oauthAccessTokens = snakeCase.table(
  "oauth_access_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    token: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    sessionId: uuid().references(() => sessions.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    refreshId: uuid().references(() => oauthRefreshTokens.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
    revoked: timestamptz(),
    confirmation: jsonb().$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex("oauth_access_tokens_token_key").on(t.token),
    index("oauth_access_tokens_client_id_idx").on(t.clientId),
    index("oauth_access_tokens_session_id_idx").on(t.sessionId),
    index("oauth_access_tokens_user_id_idx").on(t.userId),
    index("oauth_access_tokens_refresh_id_idx").on(t.refreshId),
    index("oauth_access_tokens_authorization_code_id_idx").on(t.authorizationCodeId),
  ],
);
