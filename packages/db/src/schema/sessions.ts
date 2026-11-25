import { index, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_columns";
import { users } from "./users";

// Better Auth model "session". The token is what the session cookie carries. `impersonatedBy`
// is the admin plugin's: impersonation is turned off (its endpoints are disabled), so it stays
// null, but the plugin's model has it.
export const sessions = snakeCase.table(
  "sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    token: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamptz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    impersonatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_key").on(t.token),
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
