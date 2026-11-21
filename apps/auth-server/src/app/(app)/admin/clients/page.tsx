import type { Metadata } from "next";
import { requireAdmin } from "@/shared/auth/session";
import { PageHeader } from "@/shared/ui/page-header/page-header";

export const metadata: Metadata = { title: "OIDC clients" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

// Placeholder until the oidc-clients feature lands (checklist section 6).
export default async function OidcClientsPage() {
  await requireAdmin("/admin/clients");
  return (
    <PageHeader
      title="OIDC clients"
      description="Creating, rotating and deleting clients arrives with the oidc-clients feature."
    />
  );
}
