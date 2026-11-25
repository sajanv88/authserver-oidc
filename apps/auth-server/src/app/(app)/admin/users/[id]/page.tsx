import type { Metadata } from "next";
import { notFound } from "next/navigation";
import * as v from "valibot";
import { USERS_PATH, UserScreen } from "@/features/user-admin";
import { requireAdmin } from "@/shared/auth/session";

export const metadata: Metadata = { title: "User" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

const IdSchema = v.pipe(v.string(), v.uuid());

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const parsed = v.safeParse(IdSchema, id);
  await requireAdmin(parsed.success ? `${USERS_PATH}/${parsed.output}` : USERS_PATH);
  if (!parsed.success) notFound();
  return <UserScreen id={parsed.output} />;
}
