import "server-only";
import { db, getSignInMethods } from "@repo/db";
import { cache } from "react";
import { SECURITY_PAGES, type SecurityPage } from "@/shared/auth/account-pages";
import { requireSession } from "@/shared/auth/session";
import { socialProviderName } from "@/shared/auth/social-providers";
import { env } from "@/shared/config/env";

/**
 * How the signed-in user signs in: whether they have a password, and the providers' names.
 * Once per request: the header and the page both ask. `page` is the security page asking, so
 * the session check comes back to it (and lets someone setting up two-factor stay there).
 */
export const signInMethodsForAccount = cache(async function signInMethodsForAccount(
  page: SecurityPage,
): Promise<{
  hasPassword: boolean;
  providers: string[];
}> {
  const session = await requireSession(SECURITY_PAGES[page]);
  const methods = await getSignInMethods(db, session.user.id);
  return {
    hasPassword: methods.hasPassword,
    providers: methods.providers.map((id) => socialProviderName(id, env().social)),
  };
});
