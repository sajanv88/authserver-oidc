import { TWO_FACTOR_REQUIRED_ERROR } from "@/shared/auth/social-two-factor-guard";
import type { SocialProblem } from "../types";

// What Better Auth's ?error= codes mean for the person who comes back with one. Only these
// codes are explained; anything else, and the provider's own error_description (written for
// developers, and by someone else), get the general words.

const ACCOUNT_NOT_LINKED: SocialProblem = {
  title: "You already have an account",
  text: "An account with this email exists, and we couldn't confirm the other sign-in is yours. Sign in with your password instead.",
};

const PROBLEMS: Record<string, SocialProblem> = {
  [TWO_FACTOR_REQUIRED_ERROR]: {
    title: "Two-factor authentication is on",
    text: "Your account asks for a code from your authenticator app. Sign in with your password, then the code.",
  },
  email_not_verified: {
    title: "Confirm your email first",
    text: "We sent a link to the address your account gave us. Open it, then sign in again.",
  },
  account_not_linked: ACCOUNT_NOT_LINKED,
  unable_to_link_account: ACCOUNT_NOT_LINKED,
  email_not_found: {
    text: "That account didn't share an email address, and we need one. Try another way to sign in.",
  },
  access_denied: { text: "Sign-in was cancelled. Choose a way to sign in." },
};

const GENERAL: SocialProblem = {
  text: "We couldn't sign you in that way. Try again, or use your email and password.",
};

export function socialProblem(code: string): SocialProblem {
  return Object.hasOwn(PROBLEMS, code) ? (PROBLEMS[code] ?? GENERAL) : GENERAL;
}
