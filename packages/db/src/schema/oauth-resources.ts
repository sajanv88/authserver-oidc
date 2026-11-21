import { boolean, integer, jsonb, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_columns";

// @better-auth/oauth-provider, model "oauthResource": a protected API (RFC 8707 resource
// indicator) that access tokens can be issued for. Not used by this server's own flows yet,
// but the plugin reads the table, so it has to exist.
export const oauthResources = snakeCase.table(
  "oauth_resources",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    name: text().notNull(),
    accessTokenTtl: integer(),
    refreshTokenTtl: integer(),
    signingAlgorithm: text(),
    signingKeyId: text(),
    allowedScopes: text().array(),
    customClaims: jsonb().$type<Record<string, unknown>>(),
    dpopBoundAccessTokensRequired: boolean().notNull().default(false),
    disabled: boolean().notNull().default(false),
    policyVersion: integer().notNull().default(1),
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("oauth_resources_identifier_key").on(t.identifier)],
);
