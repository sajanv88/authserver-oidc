import { index, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_columns";
import { users } from "./users";

// Better Auth model "account": one row per way a user signs in. Email and password is
// providerId "credential", with the scrypt hash in `password`.
export const accounts = snakeCase.table(
  "accounts",
  {
    id: uuid().primaryKey().defaultRandom(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("accounts_provider_id_account_id_key").on(t.providerId, t.accountId),
    index("accounts_user_id_idx").on(t.userId),
  ],
);
