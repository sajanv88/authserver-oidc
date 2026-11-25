import "server-only";
import {
  authErrorMessage,
  DISABLED_ACCOUNT_TEXT,
  isDisabledAccount,
} from "@/shared/auth/auth-errors";
import { type AuthCaller, continuationUrl, type EndpointError } from "@/shared/auth/endpoint";
import type { LoginInput } from "../schemas/login";
import type { LoginProblem } from "../types";

export type SignInOutcome =
  /** The password was right, and the account asks for a second factor: on to /two-factor. */
  | { kind: "two-factor" }
  /** Signed in inside an app's flow: Better Auth says where it goes on (consent, or the app). */
  | { kind: "continue"; url: string }
  /** Signed in, outside any flow. */
  | { kind: "signed-in" }
  | { kind: "problem"; problem: LoginProblem };

/** What a refused sign-in means for the person in front of the form. */
function problemFor(error: EndpointError, email: string): LoginProblem {
  if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED") {
    return { kind: "unverified", email } as const;
  }
  // The signed authorization query outlived its 10 minutes.
  if (error.error === "invalid_signature") return { kind: "expired" } as const;
  if (isDisabledAccount(error)) return { kind: "message", text: DISABLED_ACCOUNT_TEXT } as const;
  // Wrong password and unknown email get the same words, as they get the same answer.
  if (error.status === 401) {
    return { kind: "message", text: "Email or password is incorrect." } as const;
  }
  return {
    kind: "message",
    text: authErrorMessage(error, "We couldn't sign you in. Try again in a moment."),
  } as const;
}

/** Email and password, inside an app's flow when `oauthQuery` is the signed request. */
export async function signIn(
  call: AuthCaller,
  input: LoginInput,
  oauthQuery: string,
): Promise<SignInOutcome> {
  const result = await call({
    path: "/sign-in/email",
    body: { email: input.email, password: input.password, rememberMe: input.rememberMe ?? false },
    oauthQuery,
  });
  if (!result.ok) return { kind: "problem", problem: problemFor(result.error, input.email) };
  if (result.data.twoFactorRedirect === true) return { kind: "two-factor" };
  const url = continuationUrl(result.data);
  return url ? { kind: "continue", url } : { kind: "signed-in" };
}
