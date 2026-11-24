import "server-only";
import {
  countActiveSessions,
  db,
  type Executor,
  getSessionToken,
  listActiveSessions,
  type SessionSummary,
} from "@repo/db";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import type { Auth } from "@/shared/auth/auth-config";
import { requireSession } from "@/shared/auth/session";
import { pageOffset, pageWindow } from "@/shared/validation/paging";
import type { SessionProblem, SessionRow, SessionsPage } from "../types";
import { describeDevice } from "./user-agent";

// The account's sessions. Listing reads the database directly (Better Auth's list-sessions
// only answers for sessions less than a day old); revoking goes through Better Auth, which
// checks the session belongs to the signed-in user. Tokens never leave this file.

/** Sessions on one page of the list. */
export const SESSIONS_PER_PAGE = 10;

export function toSessionRow(session: SessionSummary, currentId: string): SessionRow {
  return {
    id: session.id,
    device: describeDevice(session.userAgent),
    ipAddress: session.ipAddress,
    signedInAt: session.createdAt.toISOString(),
    lastActiveAt: session.updatedAt.toISOString(),
    current: session.id === currentId,
  };
}

/**
 * One page of the signed-in user's sessions: this one first, then the most recently used. A
 * page past the end is the last one, so the caller can send the browser there. Checks the
 * session itself.
 */
export async function listSessionsForAccount(page: number): Promise<SessionsPage> {
  const session = await requireSession(SECURITY_PAGES.sessions);
  const userId = session.user.id;
  const window = pageWindow(page, await countActiveSessions(db, userId), SESSIONS_PER_PAGE);
  const rows = await listActiveSessions(db, userId, {
    limit: SESSIONS_PER_PAGE,
    offset: pageOffset(window),
    first: session.session.id,
  });
  return { ...window, sessions: rows.map((row) => toSessionRow(row, session.session.id)) };
}

type Who = { userId: string; currentSessionId: string };

/** Signs one of the user's other sessions out. This one is signed out with "Sign out". */
export async function revokeSession(
  auth: Auth,
  headers: Headers,
  database: Executor,
  who: Who,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; problem: SessionProblem }> {
  if (sessionId === who.currentSessionId) return { ok: false, problem: "current" };
  const token = await getSessionToken(database, who.userId, sessionId);
  if (!token) return { ok: false, problem: "not-found" };
  try {
    await auth.api.revokeSession({ headers, body: { token } });
    return { ok: true };
  } catch (error) {
    console.error("account-security: revoking a session failed", error);
    return { ok: false, problem: "failed" };
  }
}

/** Ends every session of the user, this one included (and clears its cookie). */
export async function signOutEverywhere(auth: Auth, headers: Headers): Promise<boolean> {
  try {
    await auth.api.revokeSessions({ headers });
    return true;
  } catch (error) {
    console.error("account-security: signing out everywhere failed", error);
    return false;
  }
}
