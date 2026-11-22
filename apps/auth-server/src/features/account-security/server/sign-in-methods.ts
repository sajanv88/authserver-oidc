import "server-only";
import { db, getSignInMethods } from "@repo/db";
import { requireSession } from "@/shared/auth/session";
import { socialProviderName } from "@/shared/auth/social-providers";
import { env } from "@/shared/config/env";
import { SECURITY_PATH } from "./sessions";

/** How the signed-in user signs in: whether they have a password, and the providers' names. */
export async function signInMethodsForAccount(): Promise<{
  hasPassword: boolean;
  providers: string[];
}> {
  const session = await requireSession(SECURITY_PATH);
  const methods = await getSignInMethods(db, session.user.id);
  return {
    hasPassword: methods.hasPassword,
    providers: methods.providers.map((id) => socialProviderName(id, env().social)),
  };
}
