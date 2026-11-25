"use server";

import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { signedOidcQuery } from "@/shared/auth/oidc-query";
import { callAuth, continueTo } from "@/shared/auth/server-endpoint";
import { redirectToSafePath, requireSession } from "@/shared/auth/session";
import { traceFlow } from "@/shared/telemetry/trace-flow";
import { text } from "@/shared/validation/form-data";
import { continueAfterSetup } from "../server/continue";
import type { ContinueSignInState } from "../types";

/**
 * "Continue to the app", once required two-factor is on. Better Auth checks the session and
 * the signed query (passed through signedOidcQuery again: it came from a hidden field), and
 * the OAuth plugin asks again whether two-factor is on before it answers.
 */
export async function continueSignInAction(
  previous: ContinueSignInState,
  form: FormData,
): Promise<ContinueSignInState> {
  await requireSession(SECURITY_PAGES.twoFactor);
  const attempt = previous.attempt + 1;
  const oauthQuery = signedOidcQuery(text(form, "oidcQuery"));
  if (!oauthQuery) redirectToSafePath("/");

  const outcome = await traceFlow("auth.two_factor.continue", () =>
    continueAfterSetup(callAuth, oauthQuery),
  );
  if (outcome.kind === "not-yet") return { status: "ready", attempt, notYet: true };
  if (outcome.kind === "restart") redirectToSafePath(outcome.url);
  return { status: "leaving", attempt, url: continueTo(outcome.url).away };
}
