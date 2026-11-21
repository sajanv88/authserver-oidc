import type { Executor } from "../executor";
import type { Session } from "../schema/sessions";

// Reads of a user's sessions for the account page. Revoking still goes through Better Auth:
// `getSessionToken` only finds the token to hand it.

/** A row of the session list. Never carries the token, which is what the cookie holds. */
export type SessionSummary = Pick<
  Session,
  "id" | "ipAddress" | "userAgent" | "createdAt" | "updatedAt" | "expiresAt"
>;

/** The user's sessions that haven't expired, most recently used first (at most 50). */
export async function listActiveSessions(
  db: Executor,
  userId: string,
  now: Date = new Date(),
): Promise<SessionSummary[]> {
  return db.query.sessions.findMany({
    where: { userId, expiresAt: { gt: now } },
    columns: {
      id: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
      expiresAt: true,
    },
    orderBy: { updatedAt: "desc" },
    limit: 50,
  });
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
