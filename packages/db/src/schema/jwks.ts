import { snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz } from "./_columns";

// Better Auth jwt plugin, model "jwks": the signing keys. The private key is encrypted with
// BETTER_AUTH_SECRET; the public half is served at /jwks.
export const jwks = snakeCase.table("jwks", {
  id: uuid().primaryKey().defaultRandom(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  alg: text(),
  crv: text(),
  createdAt: createdAt(),
  expiresAt: timestamptz(),
});
