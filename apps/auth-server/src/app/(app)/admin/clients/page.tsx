import type { Metadata } from "next";
import { ClientsScreen } from "@/features/oidc-clients";
import { requireAdmin } from "@/shared/auth/session";

export const metadata: Metadata = { title: "OIDC clients" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function OidcClientsPage() {
  await requireAdmin("/admin/clients");
  return <ClientsScreen />;
}
