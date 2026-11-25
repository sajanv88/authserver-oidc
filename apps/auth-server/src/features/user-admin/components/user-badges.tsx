import { Badge } from "@nuvui/react";
import type { UserStatus } from "@repo/db";
import type { TwoFactorState } from "../types";

// The facts the list and a user's page show as badges. Each says it in words, so nothing
// depends on the color.

const STATUS = {
  active: { label: "Active", intent: "success", variant: "outline" },
  disabled: { label: "Disabled", intent: "danger", variant: "solid" },
  unconfirmed: { label: "Unconfirmed", intent: "warning", variant: "outline" },
} as const;

export function StatusBadge({ status }: { status: UserStatus }) {
  const { label, intent, variant } = STATUS[status];
  return (
    <Badge intent={intent} variant={variant}>
      {label}
    </Badge>
  );
}

const TWO_FACTOR = {
  on: { label: "On", intent: "success" },
  off: { label: "Off", intent: "neutral" },
  pending: { label: "Required, not set up", intent: "warning" },
} as const;

export function TwoFactorBadge({ state }: { state: TwoFactorState }) {
  const { label, intent } = TWO_FACTOR[state];
  return (
    <Badge intent={intent} variant="outline">
      {label}
    </Badge>
  );
}

/** Dates as the admin screens write them: the day, in UTC like the rest of the admin area. */
export const dayFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** A date and time, for the history and a disabled account's end. */
export const momentFormat = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
