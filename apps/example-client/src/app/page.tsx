import { OidcCard } from "@/features/oidc";
import { SharedSessionCard } from "@/features/shared-session";
import { APP_NAME } from "@/shared/config/app";

// Reads cookies and the query: blocks on them, by design.
export const instant = false;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const { error } = await searchParams;
  return (
    <main className="page" id="content">
      <header>
        <h1>{APP_NAME}</h1>
        <p>Two ways an app on a sibling subdomain can know who you are.</p>
      </header>
      <SharedSessionCard />
      <OidcCard error={typeof error === "string" ? error : undefined} />
    </main>
  );
}
