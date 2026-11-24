/** The signed-in account's security pages, one per tab of the security nav. */
export const SECURITY_PAGES = {
  password: "/account/security",
  twoFactor: "/account/security/two-factor",
  sessions: "/account/security/sessions",
} as const;

export type SecurityPage = keyof typeof SECURITY_PAGES;
