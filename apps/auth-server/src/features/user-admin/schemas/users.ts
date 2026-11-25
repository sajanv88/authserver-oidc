import * as v from "valibot";

export const USERS_PER_PAGE = 10;

export const USER_STATUSES = ["active", "disabled", "unconfirmed"] as const;

export const ROLES = ["user", "admin"] as const;

/** A user's id, as the database writes it. */
export const UserIdSchema = v.pipe(v.string(), v.uuid());

/** `?q=` of the list: what to look for in names and emails. Too long or not text: nothing. */
export const SearchSchema = v.fallback(v.pipe(v.string(), v.trim(), v.maxLength(100)), "");

/** `?status=` of the list: one of the statuses, or every user. */
export const StatusFilterSchema = v.fallback(v.optional(v.picklist(USER_STATUSES)), undefined);

/** How long an account stays disabled. "forever": until an admin enables it. */
export const DISABLE_PERIODS = {
  forever: undefined,
  "1d": 24 * 60 * 60,
  "7d": 7 * 24 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
} as const;

export type DisablePeriod = keyof typeof DISABLE_PERIODS;

export const DisableUserSchema = v.object({
  userId: UserIdSchema,
  reason: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(200, "Keep the reason under 200 characters."),
    v.check((value) => !/\p{Cc}/u.test(value), "Write the reason on one line."),
  ),
  period: v.picklist(
    Object.keys(DISABLE_PERIODS) as [DisablePeriod, ...DisablePeriod[]],
    "Choose how long.",
  ),
});

export type DisableUserInput = v.InferOutput<typeof DisableUserSchema>;
export type DisableUserField = keyof typeof DisableUserSchema.entries;

export const DeleteUserSchema = v.object({
  userId: UserIdSchema,
  confirmation: v.pipe(
    v.string("Type the email address to confirm."),
    v.trim(),
    v.toLowerCase(),
    v.nonEmpty("Type the email address to confirm."),
  ),
});

export type DeleteUserInput = v.InferOutput<typeof DeleteUserSchema>;
export type DeleteUserField = keyof typeof DeleteUserSchema.entries;

export const ChangeRoleSchema = v.object({ userId: UserIdSchema, role: v.picklist(ROLES) });

export type ChangeRoleInput = v.InferOutput<typeof ChangeRoleSchema>;

export const RequireTwoFactorSchema = v.object({ userId: UserIdSchema, required: v.boolean() });

export type RequireTwoFactorInput = v.InferOutput<typeof RequireTwoFactorSchema>;
