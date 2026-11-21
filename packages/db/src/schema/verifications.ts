import { index, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_columns";

// Better Auth model "verification": email verification, password reset and magic-link tokens.
// Each row is deleted when its token is used, and expired rows are cleaned up.
export const verifications = snakeCase.table(
  "verifications",
  {
    id: uuid().primaryKey().defaultRandom(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("verifications_identifier_idx").on(t.identifier),
    index("verifications_expires_at_idx").on(t.expiresAt),
  ],
);
