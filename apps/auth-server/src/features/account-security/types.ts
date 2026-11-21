import type { FieldErrors } from "@/shared/validation/field-errors";
import type { ChangePasswordField } from "./schemas/account";

export type DeviceKind = "phone" | "tablet" | "computer" | "unknown";

/** A row of the session list: never the token. */
export type SessionRow = {
  id: string;
  device: { kind: DeviceKind; label: string };
  ipAddress: string | null;
  /** ISO 8601. */
  signedInAt: string;
  /** ISO 8601: Better Auth moves it when it extends the session. */
  lastActiveAt: string;
  /** The session this page was opened with. */
  current: boolean;
};

export type SessionProblem = "current" | "not-found" | "failed";

export type ChangePasswordState = {
  /** Counts the answers, so the form remounts (empty) after each one. */
  attempt: number;
  errors: FieldErrors<ChangePasswordField>;
  formError?: string | undefined;
  /** The last attempt changed it. */
  changed?: boolean | undefined;
};
