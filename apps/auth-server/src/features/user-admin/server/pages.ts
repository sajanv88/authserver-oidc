import "server-only";
import {
  type AdminActionEntry,
  countActiveSessions,
  countUsers,
  db,
  getUserDetail,
  listActiveSessions,
  listAdminActions,
  listUsers,
  type UserStatus,
  type UserSummary,
  userStatus,
} from "@repo/db";
import { notFound } from "next/navigation";
import { toSessionRow } from "@/shared/auth/devices";
import { requireAdmin } from "@/shared/auth/session";
import { twoFactorRequired } from "@/shared/auth/two-factor-policy";
import { env } from "@/shared/config/env";
import { pageOffset, pageWindow } from "@/shared/validation/paging";
import { USERS_PATH, userPath } from "../paths";
import { USER_SESSIONS_PER_PAGE, USERS_PER_PAGE } from "../schemas/users";
import type {
  HistoryEntry,
  TwoFactorState,
  UserProfile,
  UserRow,
  UserSessionsPage,
  UsersPage,
} from "../types";

function policy() {
  return { requiredForAdmins: env().twoFactorRequiredForAdmins };
}

function twoFactorState(user: UserSummary): TwoFactorState {
  if (user.twoFactorEnabled) return "on";
  return twoFactorRequired(user, policy()) ? "pending" : "off";
}

export function toUserRow(user: UserSummary, now: Date = new Date()): UserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    role: user.role,
    status: userStatus(user, now),
    twoFactor: twoFactorState(user),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toHistoryEntry(entry: AdminActionEntry): HistoryEntry {
  return {
    id: entry.id,
    action: entry.action,
    detail: entry.detail,
    by: entry.actorName ?? (entry.actorClientId ? "A service" : "A former admin"),
    at: entry.createdAt.toISOString(),
  };
}

/**
 * One page of the list, newest first. A page past the end is the last one, so the caller can
 * send the browser there. Checks the admin session itself.
 */
export async function listUsersForAdmin(query: {
  page: number;
  search: string;
  status: UserStatus | undefined;
}): Promise<UsersPage> {
  await requireAdmin(USERS_PATH);
  const filter = { search: query.search, status: query.status };
  const window = pageWindow(query.page, await countUsers(db, filter), USERS_PER_PAGE);
  const rows = await listUsers(db, {
    ...filter,
    limit: USERS_PER_PAGE,
    offset: pageOffset(window),
  });
  return { ...window, users: rows.map((row) => toUserRow(row)), ...filter };
}

/** A user's admin page, or the not-found page. Checks the admin session itself. */
export async function userProfileForAdmin(id: string): Promise<UserProfile> {
  const session = await requireAdmin(userPath(id));
  const user = await getUserDetail(db, id);
  if (!user) notFound();
  const now = new Date();
  const activeSessions = await countActiveSessions(db, id, now);
  const disabled = userStatus(user, now) === "disabled";
  return {
    ...toUserRow(user, now),
    disabledUntil: disabled ? (user.banExpires?.toISOString() ?? null) : null,
    disabledReason: disabled ? user.banReason : null,
    twoFactorRequired: user.twoFactorRequired,
    twoFactorRequiredAsAdmin: user.role === "admin" && policy().requiredForAdmins,
    activeSessions,
    isSelf: session.user.id === id,
  };
}

/**
 * One page of where a user is signed in, most recently used first. A page past the end is the
 * last one, so the caller can send the browser there. Checks the admin session itself.
 */
export async function userSessionsForAdmin(id: string, page: number): Promise<UserSessionsPage> {
  await requireAdmin(userPath(id));
  const now = new Date();
  const window = pageWindow(page, await countActiveSessions(db, id, now), USER_SESSIONS_PER_PAGE);
  const rows = await listActiveSessions(db, id, {
    limit: USER_SESSIONS_PER_PAGE,
    offset: pageOffset(window),
    now,
  });
  // No row is "this device": the admin is looking at someone else's sessions.
  return { ...window, sessions: rows.map((row) => toSessionRow(row)) };
}

/** What admins did to a user's account, newest first. Checks the admin session itself. */
export async function userHistoryForAdmin(id: string): Promise<HistoryEntry[]> {
  await requireAdmin(userPath(id));
  return (await listAdminActions(db, id)).map(toHistoryEntry);
}
