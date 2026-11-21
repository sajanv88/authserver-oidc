import { boolean, index, pgEnum, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./_columns";

// Two roles, and a third would be a deliberate change: a closed set the database enforces.
// Better Auth sees it as the `role` additional field (input: false, so sign-up can't set it).
export const userRole = pgEnum("user_role", ["user", "admin"]);

// Better Auth model "user", plus twoFactor's `twoFactorEnabled` and our `role`.
// Better Auth lowercases emails before writing, so the unique index is case-insensitive in
// practice.
export const users = snakeCase.table(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    role: userRole().notNull().default("user"),
    twoFactorEnabled: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_created_at_idx").on(t.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type UserRole = (typeof userRole.enumValues)[number];
