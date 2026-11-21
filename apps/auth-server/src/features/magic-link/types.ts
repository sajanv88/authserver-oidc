import type { Route } from "next";

/** What the magic-link page hands its form and links: plain strings. */
export type MagicLinkContext = {
  /** Where the emailed link signs the user in to: the app's flow (rebuilt fresh) or returnTo. */
  callbackURL: string;
  /** Where a link that doesn't work comes back to: this page, with the same query. */
  errorCallbackURL: string;
  /** The page was opened from a link that didn't work (expired, used, or tampered with). */
  linkFailed: boolean;
  loginHref: Route;
  /** This page again, with the same query: "Try again" after a link was sent. */
  retryHref: Route;
};

export type MagicLinkState =
  | {
      status: "editing";
      attempt: number;
      email: string;
      error?: string | undefined;
      formError?: string | undefined;
    }
  | { status: "sent"; attempt: number; email: string };
