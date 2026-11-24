import type { Metadata } from "next";
import { SecurityTwoFactorScreen } from "@/features/account-security";
import { TwoFactorSettings } from "@/features/two-factor";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { requireSession } from "@/shared/auth/session";

export const metadata: Metadata = { title: "Two-factor authentication" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function AccountTwoFactorPage() {
  const session = await requireSession(SECURITY_PAGES.twoFactor);
  return (
    <SecurityTwoFactorScreen
      user={session.user}
      twoFactor={<TwoFactorSettings enabled={session.user.twoFactorEnabled ?? false} />}
    />
  );
}
