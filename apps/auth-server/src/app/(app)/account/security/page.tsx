import type { Metadata } from "next";
import { TwoFactorSettings } from "@/features/two-factor";
import { requireSession } from "@/shared/auth/session";
import { PageHeader } from "@/shared/ui/page-header/page-header";

export const metadata: Metadata = { title: "Security" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

// Until the account-security feature lands (checklist section 6): two-factor for now; password,
// sessions and sign-out-everywhere come with it.
export default async function AccountSecurityPage() {
  const session = await requireSession("/account/security");
  return (
    <>
      <PageHeader title="Security" description={`Signed in as ${session.user.email}.`} />
      <TwoFactorSettings enabled={session.user.twoFactorEnabled ?? false} />
    </>
  );
}
