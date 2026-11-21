import { index, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_columns";
import { oauthClients } from "./oauth-clients";
import { users } from "./users";

// @better-auth/oauth-provider, model "oauthConsent": the scopes a user has approved for a
// client, so the consent screen isn't shown again for the same request.
export const oauthConsents = snakeCase.table(
  "oauth_consents",
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("oauth_consents_client_id_idx").on(t.clientId),
    index("oauth_consents_user_id_idx").on(t.userId),
  ],
);
