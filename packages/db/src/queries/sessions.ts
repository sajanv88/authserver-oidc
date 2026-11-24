import { and, count, desc, eq, gt, sql } from "drizzle-orm";
import type { Executor } from "../executor";
import { type Session, sessions } from "../schema/sessions";

// Reads of a user's sessions for the account page. Revoking still goes through Better Auth:
// `getSessionToken` only finds the token to hand it.

/** A row of the session list. Never carries the token, which is what the cookie holds. */
export type SessionSummary = Pick<
  Session,
  "id" | "ipAddress" | "userAgent" | "createdAt" | "updatedAt" | "expiresAt"
>;

/** Which of the user's sessions to list: one page, with this browser's session first. */
export type SessionListOptions = {
  /** At most 100. */
  limit: number;
  offset?: number;
  /** A session to put at the top, before the most recently used: the one asking. */
  first?: string | undefined;
  now?: Date;
};

const active = (userId: string, now: Date) =>
  and(eq(sessions.userId, userId), gt(sessions.expiresAt, now));

/** The user's sessions that haven't expired, `first` at the top, then most recently used. */
export async function listActiveSessions(
  db: Executor,
  userId: string,
  { limit, offset = 0, first, now = new Date() }: SessionListOptions,
): Promise<SessionSummary[]> {
  return db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(active(userId, now))
    .orderBy(
      ...(first ? [desc(sql`${sessions.id} = ${first}`)] : []),
      desc(sessions.updatedAt),
      desc(sessions.id),
    )
    .limit(Math.min(limit, 100))
    .offset(offset);
}

/** How many sessions of the user haven't expired, for paging through listActiveSessions. */
export async function countActiveSessions(
  db: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const [row] = await db.select({ total: count() }).from(sessions).where(active(userId, now));
  return row?.total ?? 0;
}

/** The token of one of this user's sessions, or undefined if it isn't theirs (or is gone). */
export async function getSessionToken(
  db: Executor,
  userId: string,
  sessionId: string,
): Promise<string | undefined> {
  const session = await db.query.sessions.findFirst({
    where: { id: sessionId, userId },
    columns: { token: true },
  });
  return session?.token;
}
