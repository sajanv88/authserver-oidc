import type { Metadata } from "next";
import { MagicLinkScreen, magicLinkPageContext } from "@/features/magic-link";

export const metadata: Metadata = { title: "Sign in with a link" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function MagicLinkPage({ searchParams }: PageProps<"/magic-link">) {
  return <MagicLinkScreen {...(await magicLinkPageContext(await searchParams))} />;
}
