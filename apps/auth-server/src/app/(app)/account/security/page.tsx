import type { Metadata } from "next";
import { SecurityPasswordScreen } from "@/features/account-security";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { requireSession } from "@/shared/auth/session";

export const metadata: Metadata = { title: "My profile" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function AccountSecurityPage() {
  const session = await requireSession(SECURITY_PAGES.password);
  return <SecurityPasswordScreen user={session.user} />;
}
