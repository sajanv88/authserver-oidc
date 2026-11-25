import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import * as v from "valibot";
import { USERS_PATH, UserScreen, UserScreenSkeleton } from "@/features/user-admin";
import { requireAdmin } from "@/shared/auth/session";
import { PageNumberSchema } from "@/shared/validation/paging";

export const metadata: Metadata = { title: "User" };

// Blocks on the session check by design (see the (app) layout).
export const instant = false;

const IdSchema = v.pipe(v.string(), v.uuid());

export default async function UserPage({ params, searchParams }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const parsed = v.safeParse(IdSchema, id);
  await requireAdmin(parsed.success ? `${USERS_PATH}/${parsed.output}` : USERS_PATH);
  if (!parsed.success) notFound();
  const sessionsPage = v.parse(PageNumberSchema, (await searchParams).page);
  return (
    <Suspense fallback={<UserScreenSkeleton />}>
      <UserScreen id={parsed.output} sessionsPage={sessionsPage} />
    </Suspense>
  );
}
