// Who must have two-factor on: anyone an admin requires it of, and every admin when
// TWO_FACTOR_REQUIRED_FOR_ADMINS is on. Read from the session's user, so it works wherever
// Better Auth hands one over (hooks, getSession) without another query.

/** The fields of Better Auth's user this reads; unknown, as the plugins type them loosely. */
export type TwoFactorSubject = {
  role?: unknown;
  twoFactorEnabled?: unknown;
  twoFactorRequired?: unknown;
};

export type TwoFactorPolicy = { requiredForAdmins: boolean };

/** Whether this person must have two-factor on. `user` is Better Auth's user, any shape. */
export function twoFactorRequired(user: object, policy: TwoFactorPolicy): boolean {
  const subject = user as TwoFactorSubject;
  return (
    subject.twoFactorRequired === true || (policy.requiredForAdmins && subject.role === "admin")
  );
}

/** Whether they must and haven't yet: they're sent to set it up before anything else. */
export function mustSetUpTwoFactor(user: object, policy: TwoFactorPolicy): boolean {
  return twoFactorRequired(user, policy) && (user as TwoFactorSubject).twoFactorEnabled !== true;
}
