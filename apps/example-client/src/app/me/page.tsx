import type { Metadata } from "next";
import { MeScreen } from "@/features/oidc";

export const metadata: Metadata = { title: "Tokens" };

// Reads the session cookie: blocks on it, by design.
export const instant = false;

export default async function MePage({ searchParams }: PageProps<"/me">) {
  const { refreshed } = await searchParams;
  return (
    <main className="page" id="content">
      <h1>What the sign-in gave this app</h1>
      <MeScreen refreshed={refreshed === "1"} />
    </main>
  );
}
