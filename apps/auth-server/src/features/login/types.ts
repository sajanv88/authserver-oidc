import type { Route } from "next";
import type { FieldErrors } from "@/shared/validation/field-errors";
import type { LoginField } from "./schemas/login";

export type LoginState =
  | {
      status: "editing";
      /** Counts the answers, so the form remounts with `email` after each one. */
      attempt: number;
      email: string;
      errors: FieldErrors<LoginField>;
      problem?: LoginProblem | undefined;
    }
  /** Signed in, and the app's flow goes on at another site: its redirect URI. */
  | { status: "leaving"; attempt: number; url: string };

/** A failed sign-in that isn't about one field. */
export type LoginProblem =
  | { kind: "message"; text: string }
  /** Signed in correctly, but the address isn't confirmed yet: a new link was sent. */
  | { kind: "unverified"; email: string }
  /** The authorization request's signature expired: start it again. */
  | { kind: "expired" };

/** What the login page hands its form and links: plain strings, so it crosses to the client. */
export type LoginContext = {
  /** Better Auth's signed authorization query, when an app sent the browser here. */
  oidcQuery: string;
  /** Where to go after signing in, outside an OIDC flow (already made safe). */
  returnTo: string;
  /** A fresh authorization request, to start again when the signed one has expired. */
  restartUrl?: string | undefined;
  signUpHref: Route;
  magicLinkHref: Route;
  forgotPasswordHref: Route;
};
