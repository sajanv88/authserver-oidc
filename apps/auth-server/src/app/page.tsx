import { redirect } from "next/navigation";
import { requireSession } from "@/shared/auth/session";

// Reads the session on the server before rendering anything, by design: protected UI never
// streams ahead of the auth check. So navigations here block (Next's guide for authentication
// with Cache Components); instant-navigation validation is off for this segment.
export const instant = false;

export default async function HomePage() {
  await requireSession("/account/security");
  redirect("/account/security");
}
