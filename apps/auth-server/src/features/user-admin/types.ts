import type { AdminActionKind, UserRole, UserStatus } from "@repo/db";
import type { SessionRow } from "@/shared/auth/devices";
import type { FieldErrors } from "@/shared/validation/field-errors";
import type { PageWindow } from "@/shared/validation/paging";
import type { DeleteUserField, DisableUserField } from "./schemas/users";

/** Two-factor as an admin sees it: on, off, or required and not set up yet. */
export type TwoFactorState = "on" | "off" | "pending";

/** A row of the user list. Dates are ISO 8601. */
export type UserRow = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: UserRole;
  status: UserStatus;
  twoFactor: TwoFactorState;
  lastActiveAt: string | null;
  createdAt: string;
};

/** One page of the list, and the search it shows. */
export type UsersPage = PageWindow & {
  users: UserRow[];
  search: string;
  status: UserStatus | undefined;
};

/** An entry of a user's history: what an admin did, and who. */
export type HistoryEntry = {
  id: string;
  action: AdminActionKind;
  /** A role or an ISO date, depending on the action. */
  detail: string | null;
  /** The admin's name, or "A service", or "A former admin". */
  by: string;
  at: string;
};

/** A user's admin page. */
export type UserProfile = UserRow & {
  /** When a disabled account opens again by itself (ISO 8601), or null. */
  disabledUntil: string | null;
  /** Why it was disabled, as the admin wrote it. */
  disabledReason: string | null;
  /** An admin requires two-factor of this person. */
  twoFactorRequired: boolean;
  /** Required because they're an admin and the server requires it of every admin. */
  twoFactorRequiredAsAdmin: boolean;
  activeSessions: number;
  /** The admin looking at the page: they can't act on their own account here. */
  isSelf: boolean;
};

/** One page of the sessions on a user's admin page. */
export type UserSessionsPage = PageWindow & { sessions: SessionRow[] };

/** What stopped an admin action, for the screen to say. */
export type AdminProblem =
  /** The account is gone. */
  | "not-found"
  /** The admin's own account. */
  | "self"
  /** The admin session ended, or isn't an admin's any more. */
  | "not-allowed"
  | "failed";

export type AdminResult = { ok: true } | { ok: false; problem: AdminProblem };

export type DisableUserState = {
  attempt: number;
  values: { reason: string; period: string };
  errors?: FieldErrors<DisableUserField> | undefined;
  formError?: string | undefined;
  done?: boolean | undefined;
};

export type DeleteUserState = {
  attempt: number;
  errors?: FieldErrors<DeleteUserField> | undefined;
  formError?: string | undefined;
  done?: boolean | undefined;
};
