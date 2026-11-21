import { boolean, index, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_columns";
import { users } from "./users";

// @better-auth/oauth-provider, model "oauthClient": a registered OIDC client. Field names
// follow the plugin (RFC 7591 metadata in camelCase). `clientSecret` is stored hashed.
// A public client has tokenEndpointAuthMethod "none" and no secret.
export const oauthClients = snakeCase.table(
  "oauth_clients",
  {
    id: uuid().primaryKey().defaultRandom(),
    clientId: text().notNull(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: boolean().notNull().default(false),
    skipConsent: boolean(),
    enableEndSession: boolean(),
    subjectType: text(),
    scopes: text().array(),
    clientCredentialsScopes: text().array().default([]),
    userId: uuid().references(() => users.id, { onDelete: "cascade" }),
    referenceId: text(),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: text().array(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: text().array().notNull(),
    postLogoutRedirectUris: text().array(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: boolean(),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: text().array(),
    responseTypes: text().array(),
    // Named explicitly: the automatic conversion would split the acronym letter by letter.
    requirePKCE: boolean("require_pkce"),
    dpopBoundAccessTokens: boolean().notNull().default(false),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("oauth_clients_client_id_key").on(t.clientId),
    index("oauth_clients_user_id_idx").on(t.userId),
    index("oauth_clients_created_at_idx").on(t.createdAt),
  ],
);

export type OAuthClient = typeof oauthClients.$inferSelect;
