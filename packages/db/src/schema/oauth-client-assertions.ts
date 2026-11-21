import { index, snakeCase, text } from "drizzle-orm/pg-core";
import { timestamptz } from "./_columns";

// @better-auth/oauth-provider, model "oauthClientAssertion": used client-assertion JWT ids,
// kept until they expire so a replayed assertion is refused. The id is the client's `jti`,
// any string, so this is the one table whose primary key isn't a uuid.
export const oauthClientAssertions = snakeCase.table(
  "oauth_client_assertions",
  {
    id: text().primaryKey(),
    expiresAt: timestamptz().notNull(),
  },
  (t) => [index("oauth_client_assertions_expires_at_idx").on(t.expiresAt)],
);
