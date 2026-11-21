"use server";

import { redirect } from "next/navigation";
import { authPageHref } from "@/shared/auth/auth-pages";
import { signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth, continueTo } from "@/shared/auth/server-endpoint";
import { redirectToSafePath } from "@/shared/auth/session";
import { parseForm } from "@/shared/validation/field-errors";
import { fieldsOf, text } from "@/shared/validation/form-data";
import { LoginSchema } from "../schemas/login";
import { signIn } from "../server/sign-in";
import type { LoginState } from "../types";

// Public by nature: Next has checked the Origin, valibot the fields, Better Auth rate-limits by
// client IP and checks the signed OIDC query itself.

export async function signInAction(previous: LoginState, form: FormData): Promise<LoginState> {
  const attempt = previous.attempt + 1;
  const email = text(form, "email");
  const oidcQuery = signedOidcQuery(text(form, "oidcQuery"));
  const returnTo = safeReturnPath(text(form, "returnTo"));

  const parsed = parseForm(LoginSchema, fieldsOf(form));
  if (!parsed.ok) return { status: "editing", attempt, email, errors: parsed.errors };

  const outcome = await signIn(callAuth, parsed.value, oidcQuery);
  switch (outcome.kind) {
    case "problem":
      return { status: "editing", attempt, email, errors: {}, problem: outcome.problem };
    case "two-factor": {
      // /two-factor keeps what this page was opened with, so verifying resumes the same way.
      const carry =
        oidcQuery || (returnTo === "/" ? "" : new URLSearchParams({ returnTo }).toString());
      return redirect(authPageHref("twoFactor", carry));
    }
    case "continue":
      return { status: "leaving", attempt, url: continueTo(outcome.url).away };
    case "signed-in":
      return redirectToSafePath(returnTo);
  }
}
