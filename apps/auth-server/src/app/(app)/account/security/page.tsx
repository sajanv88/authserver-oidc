import type { Metadata } from "next";
import { requireSession } from "@/shared/auth/session";
import { PageHeader } from "@/shared/ui/page-header/page-header";

export const metadata: Metadata = { title: "Security" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

// Placeholder until the account-security feature lands (checklist section 6).
export default async function AccountSecurityPage() {
  const session = await requireSession("/account/security");
  return (
    <PageHeader
      title="Security"
      description={`Signed in as ${session.user.email}. Password, two-factor and sessions arrive with the account-security feature.`}
    />
  );
}
