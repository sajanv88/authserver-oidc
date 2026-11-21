import type { Metadata } from "next";
import { TwoFactorScreen, twoFactorPageContext } from "@/features/two-factor";

export const metadata: Metadata = { title: "Two-factor authentication" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function TwoFactorPage({ searchParams }: PageProps<"/two-factor">) {
  return <TwoFactorScreen {...(await twoFactorPageContext(await searchParams))} />;
}
