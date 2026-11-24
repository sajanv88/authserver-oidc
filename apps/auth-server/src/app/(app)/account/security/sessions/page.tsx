import type { Metadata } from "next";
import { SecuritySessionsScreen } from "@/features/account-security";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { requireSession } from "@/shared/auth/session";

export const metadata: Metadata = { title: "Sessions" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function AccountSessionsPage({
  searchParams,
}: PageProps<"/account/security/sessions">) {
  const session = await requireSession(SECURITY_PAGES.sessions);
  return <SecuritySessionsScreen user={session.user} page={(await searchParams).page} />;
}
