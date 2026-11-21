"use server";

import * as v from "valibot";
import { authorizeUrlFrom, signedOidcQuery } from "@/shared/auth/oidc-query";
import { callAuth, continueTo } from "@/shared/auth/server-endpoint";
import { redirectToSafePath } from "@/shared/auth/session";
import { fieldsOf, text } from "@/shared/validation/form-data";
import { ConsentDecisionSchema } from "../schemas/consent";
import { decide, signOutHere } from "../server/consent";
import type { ConsentState } from "../types";

// Better Auth authenticates (the session cookie) and checks the signed query; Next has checked
// the Origin; valibot checks the decision.

export async function consentAction(previous: ConsentState, form: FormData): Promise<ConsentState> {
  const attempt = previous.attempt + 1;
  const parsed = v.safeParse(ConsentDecisionSchema, fieldsOf(form));
  if (!parsed.success) return { status: "deciding", attempt };
  const answer = await decide(
    callAuth,
    parsed.output.decision === "allow",
    signedOidcQuery(text(form, "oidcQuery")),
  );
  if (!answer.ok) return { status: "deciding", attempt, problem: answer.problem };
  return { status: "leaving", attempt, url: continueTo(answer.url).away };
}

/** "Use another account": sign out, then start the app's request again (through sign-in). */
export async function switchAccountAction(form: FormData): Promise<void> {
  await signOutHere(callAuth);
  redirectToSafePath(authorizeUrlFrom(signedOidcQuery(text(form, "oidcQuery"))) ?? "/");
}
