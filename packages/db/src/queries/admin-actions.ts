import { desc, eq } from "drizzle-orm";
import type { Executor } from "../executor";
import { type AdminAction, type AdminActionKind, adminActions } from "../schema/admin-actions";
import { users } from "../schema/users";

// The audit log of admin actions on accounts. Rows are only ever added.

/** Who acted: an admin, or (later) a service with its client ID. */
export type AdminActor = { userId: string } | { clientId: string };

export type NewAdminAction = {
  action: AdminActionKind;
  targetUserId: string;
  actor: AdminActor;
  /** A fixed word or an ISO date, never text someone typed. */
  detail?: string | undefined;
};

export async function recordAdminAction(
  db: Executor,
  { action, targetUserId, actor, detail }: NewAdminAction,
): Promise<void> {
  await db.insert(adminActions).values({
    action,
    targetUserId,
    actorUserId: "userId" in actor ? actor.userId : null,
    actorClientId: "clientId" in actor ? actor.clientId : null,
    detail: detail ?? null,
  });
}

/** An entry of a user's history, with the acting admin's name if they still exist. */
export type AdminActionEntry = Pick<
  AdminAction,
  "id" | "action" | "detail" | "createdAt" | "actorUserId" | "actorClientId"
> & { actorName: string | null };

/** What admins did to this user, newest first (at most 100). */
export async function listAdminActions(
  db: Executor,
  targetUserId: string,
  limit = 20,
): Promise<AdminActionEntry[]> {
  return db
    .select({
      id: adminActions.id,
      action: adminActions.action,
      detail: adminActions.detail,
      createdAt: adminActions.createdAt,
      actorUserId: adminActions.actorUserId,
      actorClientId: adminActions.actorClientId,
      actorName: users.name,
    })
    .from(adminActions)
    .leftJoin(users, eq(users.id, adminActions.actorUserId))
    .where(eq(adminActions.targetUserId, targetUserId))
    .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
    .limit(Math.min(limit, 100));
}
