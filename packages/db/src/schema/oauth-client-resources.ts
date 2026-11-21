import { foreignKey, index, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_columns";
import { oauthClients } from "./oauth-clients";
import { oauthResources } from "./oauth-resources";

// @better-auth/oauth-provider, model "oauthClientResource": which resources a client may
// request tokens for. Joins on the public identifiers, as the plugin does.
export const oauthClientResources = snakeCase.table(
  "oauth_client_resources",
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text()
      .notNull()
      .references(() => oauthClients.clientId, { onDelete: "cascade" }),
    resourceId: text().notNull(),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    // Declared here to name it: the generated name is too long and would be hashed.
    foreignKey({
      name: "oauth_client_resources_resource_id_fkey",
      columns: [t.resourceId],
      foreignColumns: [oauthResources.identifier],
    }).onDelete("cascade"),
    uniqueIndex("oauth_client_resources_client_id_resource_id_key").on(t.clientId, t.resourceId),
    index("oauth_client_resources_resource_id_idx").on(t.resourceId),
  ],
);
