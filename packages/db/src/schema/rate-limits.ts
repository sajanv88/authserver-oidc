import { bigint, integer, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Better Auth model "rateLimit" (rateLimit.storage: "database"), shared by every replica.
// `key` is the client IP and path; `lastRequest` is a time in milliseconds, as Better Auth
// writes it.
export const rateLimits = snakeCase.table(
  "rate_limits",
  {
    id: uuid().primaryKey().defaultRandom(),
    key: text().notNull(),
    count: integer().notNull(),
    lastRequest: bigint({ mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("rate_limits_key_key").on(t.key)],
);
