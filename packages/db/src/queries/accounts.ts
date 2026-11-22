import type { Executor } from "../executor";

// How a user signs in, for the account page. Never the password hash or a provider's tokens.

export type SignInMethods = {
  /** Has an email-and-password login ("credential" account). */
  hasPassword: boolean;
  /** The other providers linked to the account ("google", "github", "sso"…), sorted. */
  providers: string[];
};

export async function getSignInMethods(db: Executor, userId: string): Promise<SignInMethods> {
  const rows = await db.query.accounts.findMany({
    where: { userId },
    columns: { providerId: true },
  });
  const ids = rows.map((row) => row.providerId);
  return {
    hasPassword: ids.includes("credential"),
    providers: [...new Set(ids.filter((id) => id !== "credential"))].sort(),
  };
}
