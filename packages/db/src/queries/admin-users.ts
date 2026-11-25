import { and, count, desc, eq, ilike, max, not, or, type SQL, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { sessions } from "../schema/sessions";
import { twoFactors } from "../schema/two-factors";
import { type User, users } from "../schema/users";

// Reads of the users table for the admin's Users screens, and the two changes the admin plugin
// has no endpoint for: requiring two-factor, and resetting it. Disabling, enabling, roles,
// sign-outs and deletion go through Better Auth's admin plugin.

/**
 * Where an account stands. Disabled wins: a disabled account whose end date has passed is
 * active again (Better Auth lifts it at the next sign-in). Unconfirmed: the email address
 * hasn't been confirmed, so the person can't sign in yet.
 */
export type UserStatus = "active" | "disabled" | "unconfirmed";

/** A row of the admin's user list, and the head of a user's page. */
export type UserSummary = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "image"
  | "role"
  | "emailVerified"
  | "twoFactorEnabled"
  | "twoFactorRequired"
  | "banned"
  | "banExpires"
  | "createdAt"
> & {
  /** When one of the user's sessions was last used, or null if there's none left. */
  lastActiveAt: Date | null;
};

/** A user as an admin sees them on their own page: the summary, and why they're disabled. */
export type UserDetail = UserSummary & Pick<User, "banReason">;

export type UserFilter = {
  /** Part of the name or email, any case. */
  search?: string | undefined;
  status?: UserStatus | undefined;
  now?: Date;
};

/** A LIKE pattern that matches `text` anywhere, with LIKE's own wildcards taken literally. */
function containing(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Disabled now: banned, with no end date or one still ahead. */
function disabledAt(now: Date): SQL {
  return sql`(${users.banned} and (${users.banExpires} is null or ${users.banExpires} > ${now}))`;
}

function whereFor({ search, status, now = new Date() }: UserFilter): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];
  const text = search?.trim();
  if (text) {
    const pattern = containing(text);
    conditions.push(or(ilike(users.email, pattern), ilike(users.name, pattern)));
  }
  if (status === "disabled") conditions.push(disabledAt(now));
  if (status === "unconfirmed") {
    conditions.push(not(disabledAt(now)), eq(users.emailVerified, false));
  }
  if (status === "active") conditions.push(not(disabledAt(now)), eq(users.emailVerified, true));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

function summaryColumns() {
  return {
    id: users.id,
    name: users.name,
    email: users.email,
    image: users.image,
    role: users.role,
    emailVerified: users.emailVerified,
    twoFactorEnabled: users.twoFactorEnabled,
    twoFactorRequired: users.twoFactorRequired,
    banned: users.banned,
    banExpires: users.banExpires,
    createdAt: users.createdAt,
  };
}

/** Each user's most recent session use, as a subquery to join. */
function lastActivePerUser(db: Executor) {
  return db
    .select({
      userId: sessions.userId,
      lastActiveAt: max(sessions.updatedAt).as("last_active_at"),
    })
    .from(sessions)
    .groupBy(sessions.userId)
    .as("last_active");
}

/** Users matching `filter`, newest first, a page at a time (at most 100). */
export async function listUsers(
  db: Executor,
  { limit, offset = 0, ...filter }: UserFilter & { limit: number; offset?: number },
): Promise<UserSummary[]> {
  const activity = lastActivePerUser(db);
  return db
    .select({ ...summaryColumns(), lastActiveAt: activity.lastActiveAt })
    .from(users)
    .leftJoin(activity, eq(activity.userId, users.id))
    .where(whereFor(filter))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(Math.min(limit, 100))
    .offset(offset);
}

/** How many users match `filter`, for paging through listUsers. */
export async function countUsers(db: Executor, filter: UserFilter = {}): Promise<number> {
  const [row] = await db.select({ total: count() }).from(users).where(whereFor(filter));
  return row?.total ?? 0;
}

/** One user, for their admin page, or undefined. */
export async function getUserDetail(db: Executor, id: string): Promise<UserDetail | undefined> {
  const activity = lastActivePerUser(db);
  const [row] = await db
    .select({
      ...summaryColumns(),
      banReason: users.banReason,
      lastActiveAt: activity.lastActiveAt,
    })
    .from(users)
    .leftJoin(activity, eq(activity.userId, users.id))
    .where(eq(users.id, id));
  return row;
}

/** Where an account stands now (see UserStatus). */
export function userStatus(
  user: Pick<User, "banned" | "banExpires" | "emailVerified">,
  now: Date = new Date(),
): UserStatus {
  if (user.banned && (user.banExpires === null || user.banExpires > now)) return "disabled";
  return user.emailVerified ? "active" : "unconfirmed";
}

/** Whether an admin requires two-factor of this user. False if there's no such user. */
export async function setTwoFactorRequired(
  db: Executor,
  id: string,
  required: boolean,
): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ twoFactorRequired: required })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  return rows.length > 0;
}

/**
 * Turns two-factor off for a user who lost their authenticator: the secret and backup codes
 * go, and the flag Better Auth checks at sign-in is cleared. Better Auth has no endpoint for
 * an admin to do this. False if there's no such user.
 */
export async function resetTwoFactor(db: Executor, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, id));
    const rows = await tx
      .update(users)
      .set({ twoFactorEnabled: false })
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return rows.length > 0;
  });
}
