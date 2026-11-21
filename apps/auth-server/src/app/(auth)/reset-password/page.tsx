import type { Metadata } from "next";
import { ResetPasswordScreen, resetPasswordPageContext } from "@/features/password-reset";

export const metadata: Metadata = { title: "Choose a new password" };

// Reads the query (returnTo, the OIDC request, the emailed token): rendered per request.
export const instant = false;

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return <ResetPasswordScreen {...resetPasswordPageContext(await searchParams)} />;
}
