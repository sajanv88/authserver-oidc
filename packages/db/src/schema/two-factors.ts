import { boolean, index, integer, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { timestamptz } from "./_columns";
import { users } from "./users";

// Better Auth twoFactor plugin, model "twoFactor": the TOTP secret and backup codes, both
// encrypted by Better Auth, and the lockout counter shared by TOTP, OTP and backup codes.
export const twoFactors = snakeCase.table(
  "two_factors",
  {
    id: uuid().primaryKey().defaultRandom(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    verified: boolean().notNull().default(true),
    failedVerificationCount: integer().notNull().default(0),
    lockedUntil: timestamptz(),
  },
  (t) => [
    index("two_factors_user_id_idx").on(t.userId),
    index("two_factors_secret_idx").on(t.secret),
  ],
);
