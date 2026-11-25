import { index, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./_columns";
import { oauthClients } from "./oauth-clients";

// Pushed authorization requests (RFC 9126): an app's authorization parameters, posted to
// /oauth2/par before the browser is sent to /oauth2/authorize with only a request_uri. Not one
// of Better Auth's tables: the auth server's PAR endpoint writes a row, and the plugin's
// requestUriResolver consumes it, once. Only the request_uri's SHA-256 is kept.
export const oauthPushedRequests = snakeCase.table(
  "oauth_pushed_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    requestUriHash: text().notNull(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    parameters: jsonb().$type<Record<string, string>>().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("oauth_pushed_requests_request_uri_hash_key").on(t.requestUriHash),
    index("oauth_pushed_requests_client_id_idx").on(t.clientId),
    index("oauth_pushed_requests_expires_at_idx").on(t.expiresAt),
  ],
);

export type OAuthPushedRequest = typeof oauthPushedRequests.$inferSelect;
