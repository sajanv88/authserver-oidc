import type { Metadata } from "next";
import { SecurityTwoFactorScreen } from "@/features/account-security";
import { ContinueSignIn, TwoFactorSettings } from "@/features/two-factor";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { signedOidcQuery } from "@/shared/auth/oidc-query";
import { requireSession, twoFactorRequiredFor } from "@/shared/auth/session";

export const metadata: Metadata = { title: "Two-factor authentication" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

// Also where an app's sign-in sends someone who must set up two-factor (the OAuth plugin's
// postLogin page), with the app's signed query: once it's on, ContinueSignIn goes on with it.
export default async function AccountTwoFactorPage({
  searchParams,
}: PageProps<"/account/security/two-factor">) {
  const session = await requireSession(SECURITY_PAGES.twoFactor);
  const oidcQuery = signedOidcQuery(await searchParams);
  const enabled = session.user.twoFactorEnabled ?? false;
  return (
    <SecurityTwoFactorScreen
      user={session.user}
      twoFactor={
        <>
          {oidcQuery && enabled ? <ContinueSignIn oidcQuery={oidcQuery} /> : null}
          <TwoFactorSettings enabled={enabled} required={twoFactorRequiredFor(session.user)} />
        </>
      }
    />
  );
}
