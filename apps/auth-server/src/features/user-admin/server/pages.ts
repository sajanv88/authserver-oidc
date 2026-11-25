import "server-only";
import {
  type AdminActionEntry,
  countActiveSessions,
  countUsers,
  db,
  getUserDetail,
  listAdminActions,
  listUsers,
  type UserStatus,
  type UserSummary,
  userStatus,
} from "@repo/db";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/shared/auth/session";
import { twoFactorRequired } from "@/shared/auth/two-factor-policy";
import { env } from "@/shared/config/env";
import { pageOffset, pageWindow } from "@/shared/validation/paging";
import { USERS_PATH, userPath } from "../paths";
import { USERS_PER_PAGE } from "../schemas/users";
import type { HistoryEntry, TwoFactorState, UserProfile, UserRow, UsersPage } from "../types";

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
  const [activeSessions, history] = await Promise.all([
    countActiveSessions(db, id, now),
    listAdminActions(db, id),
  ]);
  const disabled = userStatus(user, now) === "disabled";
  return {
    ...toUserRow(user, now),
    disabledUntil: disabled ? (user.banExpires?.toISOString() ?? null) : null,
    disabledReason: disabled ? user.banReason : null,
    twoFactorRequired: user.twoFactorRequired,
    twoFactorRequiredAsAdmin: user.role === "admin" && policy().requiredForAdmins,
    activeSessions,
    history: history.map(toHistoryEntry),
    isSelf: session.user.id === id,
  };
}
