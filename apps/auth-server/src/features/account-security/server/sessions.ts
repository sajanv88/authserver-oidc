import "server-only";
import {
  db,
  type Executor,
  getSessionToken,
  listActiveSessions,
  type SessionSummary,
} from "@repo/db";
import type { Auth } from "@/shared/auth/auth-config";
import { requireSession } from "@/shared/auth/session";
import type { SessionProblem, SessionRow } from "../types";
import { describeDevice } from "./user-agent";

// The account's sessions. Listing reads the database directly (Better Auth's list-sessions
// only answers for sessions less than a day old); revoking goes through Better Auth, which
// checks the session belongs to the signed-in user. Tokens never leave this file.

export const SECURITY_PATH = "/account/security";

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

/** The signed-in user's sessions, this one first. Checks the session itself. */
export async function listSessionsForAccount(): Promise<SessionRow[]> {
  const session = await requireSession(SECURITY_PATH);
  const rows = (await listActiveSessions(db, session.user.id)).map((row) =>
    toSessionRow(row, session.session.id),
  );
  return rows.sort((a, b) => Number(b.current) - Number(a.current));
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
