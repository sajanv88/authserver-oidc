import type { Route } from "next";
import type { FieldErrors } from "@/shared/validation/field-errors";
import type { LoginField } from "./schemas/login";

/** Where the sign-in form is. */
export type LoginState =
  | { status: "editing"; errors: FieldErrors<LoginField>; problem?: LoginProblem }
  | { status: "submitting" }
  /** Signed in: the browser is on its way (to consent, the client, /two-factor or returnTo). */
  | { status: "leaving" };

/** A failed sign-in that isn't about one field. */
export type LoginProblem =
  | { kind: "message"; text: string }
  /** Signed in correctly, but the address isn't confirmed yet: a new link was sent. */
  | { kind: "unverified"; email: string }
  /** The authorization request's signature expired: start it again. */
  | { kind: "expired" };

/** What the login page hands its form and links: plain strings, so it crosses to the client. */
export type LoginContext = {
  /** Where to go after signing in, outside an OIDC flow (already made safe). */
  returnTo: string;
  /** A fresh authorization request, to start again when the signed one has expired. */
  restartUrl?: string | undefined;
  signUpHref: Route;
  magicLinkHref: Route;
  forgotPasswordHref: Route;
};
