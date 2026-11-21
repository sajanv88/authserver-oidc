import type { Metadata } from "next";
import { ForgotPasswordScreen, forgotPasswordPageContext } from "@/features/password-reset";

export const metadata: Metadata = { title: "Reset your password" };

// Reads the query (returnTo, the OIDC request, the emailed token): rendered per request.
export const instant = false;

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return <ForgotPasswordScreen {...forgotPasswordPageContext(await searchParams)} />;
}
