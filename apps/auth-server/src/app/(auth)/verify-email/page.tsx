import type { Metadata } from "next";
import { VerifyEmailFailedScreen, verifyEmailPageContext } from "@/features/signup";

export const metadata: Metadata = { title: "Confirm your email" };

// Redirects on success, so it's rendered per request.
export const instant = false;

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return <VerifyEmailFailedScreen {...(await verifyEmailPageContext(await searchParams))} />;
}
