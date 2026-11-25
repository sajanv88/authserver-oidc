import { boolean, index, pgEnum, snakeCase, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, timestamptz, updatedAt } from "./_columns";

// Two roles, and a third would be a deliberate change: a closed set the database enforces.
// Better Auth sees it as the `role` field (the admin plugin's, and input: false, so sign-up
// can't set it); the app refuses any other value before it gets here.
export const userRole = pgEnum("user_role", ["user", "admin"]);

// Better Auth model "user", plus twoFactor's `twoFactorEnabled`, the admin plugin's `role`,
// `banned`, `banReason` and `banExpires` (a disabled account), and our `twoFactorRequired`
// (an admin requires two-factor for this person).
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
    twoFactorRequired: boolean().notNull().default(false),
    banned: boolean().notNull().default(false),
    // Seen by admins only, never by the person.
    banReason: text(),
    // When a disabled account opens again by itself; null while it's disabled until an admin
    // enables it.
    banExpires: timestamptz(),
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
