import type { Metadata } from "next";
import { ConsentScreen, consentPageContext } from "@/features/oidc-consent";

export const metadata: Metadata = { title: "Allow access" };

// Reads the session and the signed query: blocks on them, by design.
export const instant = false;

export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  return <ConsentScreen {...(await consentPageContext(await searchParams))} />;
}
