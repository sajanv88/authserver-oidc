import type { Route } from "next";

export const AUTH_PAGES = {
  login: "/login",
  signup: "/signup",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  magicLink: "/magic-link",
  twoFactor: "/two-factor",
  consent: "/consent",
} as const;

export type AuthPage = keyof typeof AUTH_PAGES;

/**
 * A link to an auth page, with an optional query. Typed routes only know a page once it
 * exists, and these pages ship one feature at a time, so the one cast to Route is here.
 */
export function authPageHref(page: AuthPage, query?: URLSearchParams | string): Route {
  const search = query === undefined ? "" : String(query).replace(/^\?/, "");
  return (search ? `${AUTH_PAGES[page]}?${search}` : AUTH_PAGES[page]) as Route;
}
