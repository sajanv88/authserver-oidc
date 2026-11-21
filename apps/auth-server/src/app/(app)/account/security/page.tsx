import type { Metadata } from "next";
import { AccountSecurityScreen } from "@/features/account-security";
import { TwoFactorSettings } from "@/features/two-factor";
import { requireSession } from "@/shared/auth/session";

export const metadata: Metadata = { title: "Security" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function AccountSecurityPage() {
  const session = await requireSession("/account/security");
  return (
    <AccountSecurityScreen
      email={session.user.email}
      twoFactor={<TwoFactorSettings enabled={session.user.twoFactorEnabled ?? false} />}
    />
  );
}
