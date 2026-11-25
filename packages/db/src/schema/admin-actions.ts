import { index, pgEnum, snakeCase, text, uuid } from "drizzle-orm/pg-core";
import { createdAt } from "./_columns";
import { users } from "./users";

// What an admin can do to an account. A closed set, like roles: a new kind of action is a
// deliberate change, with a migration.
export const adminActionKind = pgEnum("admin_action_kind", [
  "user.disable",
  "user.enable",
  "user.sign_out",
  "user.delete",
  "user.role",
  "user.two_factor.require",
  "user.two_factor.unrequire",
  "user.two_factor.reset",
]);

// Who did what to which account, and when: every admin action on a user, from the admin
// screens (and later from a service, with its client ID). Not one of Better Auth's tables.
// It holds no email, name or reason, so it can outlive the account: the target is a bare id
// without a foreign key, and an admin who is deleted leaves their rows with a null actor.
export const adminActions = snakeCase.table(
  "admin_actions",
  {
    id: uuid().primaryKey().defaultRandom(),
    action: adminActionKind().notNull(),
    targetUserId: uuid().notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: "set null" }),
    actorClientId: text(),
    // A fixed word or date about the action: the new role, or when a disabled account opens
    // again. Never text an admin typed.
    detail: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index("admin_actions_target_user_id_created_at_idx").on(t.targetUserId, t.createdAt),
    index("admin_actions_actor_user_id_idx").on(t.actorUserId),
  ],
);

export type AdminAction = typeof adminActions.$inferSelect;
export type AdminActionKind = (typeof adminActionKind.enumValues)[number];
