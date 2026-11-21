import { eq } from "drizzle-orm";
import type { Executor } from "../executor";
import { type User, users } from "../schema/users";

// Query functions take the executor first so they work with `db`, inside a transaction (`tx`),
// and against PGlite in tests. No business rules here: what a query does, not who may run it.
// Reads and writes Better Auth owns (sign-up, sessions, tokens) go through Better Auth.

export type UserSecurity = Pick<User, "id" | "emailVerified" | "twoFactorEnabled" | "role">;

/**
 * The security-relevant flags of the user with this email, or undefined. Better Auth stores
 * emails lowercased, so the lookup is too.
 */
export async function getUserSecurityByEmail(
  db: Executor,
  email: string,
): Promise<UserSecurity | undefined> {
  return db.query.users.findFirst({
    where: { email: email.trim().toLowerCase() },
    columns: { id: true, emailVerified: true, twoFactorEnabled: true, role: true },
  });
}

export type UserAccess = Pick<User, "role" | "emailVerified">;

/**
 * Sets a user's role and whether the email is confirmed, by email. For the local seed, which
 * makes its admin this way; the app never changes a role. Undefined if there's no such user.
 */
export async function updateUserAccess(
  db: Executor,
  email: string,
  access: UserAccess,
): Promise<UserSecurity | undefined> {
  const [user] = await db
    .update(users)
    .set(access)
    .where(eq(users.email, email.trim().toLowerCase()))
    .returning({
      id: users.id,
      emailVerified: users.emailVerified,
      twoFactorEnabled: users.twoFactorEnabled,
      role: users.role,
    });
  return user;
}
