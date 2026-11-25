import type { Metadata } from "next";
import { USERS_PATH, UsersScreen } from "@/features/user-admin";
import { requireAdmin } from "@/shared/auth/session";

export const metadata: Metadata = { title: "Users" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireAdmin(USERS_PATH);
  const { page, q, status } = await searchParams;
  return <UsersScreen page={page} q={q} status={status} />;
}
