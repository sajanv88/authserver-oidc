import "server-only";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { type AuthCaller, continuationUrl } from "@/shared/auth/endpoint";
import type { ConsentProblem } from "../types";

/**
 * Allow or deny an app's request. Better Auth checks the signed query again, records consent,
 * and answers with the way back to the app: a code, or `error=access_denied`.
 */
export async function decide(
  call: AuthCaller,
  accept: boolean,
  oauthQuery: string,
): Promise<{ ok: true; url: string } | { ok: false; problem: ConsentProblem }> {
  const result = await call({ path: "/oauth2/consent", body: { accept }, oauthQuery });
  if (!result.ok) {
    // The signed request outlived its 10 minutes, or the session ended meanwhile.
    if (result.error.error === "invalid_signature" || result.status === 401) {
      return { ok: false, problem: { kind: "expired" } };
    }
    return {
      ok: false,
      problem: {
        kind: "message",
        text: authErrorMessage(
          result.error,
          "Your answer didn't go through. Try again in a moment.",
        ),
      },
    };
  }
  const url = continuationUrl(result.data);
  return url
    ? { ok: true, url }
    : {
        ok: false,
        problem: { kind: "message", text: "Your answer didn't go through. Try again." },
      };
}

/** Ends this session, for "Use another account". */
export async function signOutHere(call: AuthCaller): Promise<void> {
  await call({ path: "/sign-out" });
}
