import type { SessionRow } from "@/shared/auth/devices";
import type { FieldErrors } from "@/shared/validation/field-errors";
import type { PageWindow } from "@/shared/validation/paging";
import type { ChangePasswordField } from "./schemas/account";

/** The signed-in user, as the profile pages show it. */
export type AccountUser = {
  name: string;
  email: string;
  image?: string | null | undefined;
  createdAt: Date;
  role?: string | null | undefined;
  twoFactorEnabled?: boolean | null | undefined;
};

/** One page of the session list. `page` is the one shown, which is at most `pageCount`. */
export type SessionsPage = PageWindow & { sessions: SessionRow[] };

export type SessionProblem = "current" | "not-found" | "failed";

export type ChangePasswordState = {
  /** Counts the answers, so the form remounts (empty) after each one. */
  attempt: number;
  errors: FieldErrors<ChangePasswordField>;
  formError?: string | undefined;
  /** The last attempt changed it. */
  changed?: boolean | undefined;
};
