"use server";

import * as v from "valibot";
import { captchaToken, withCaptcha } from "@/shared/auth/captcha";
import { signedOidcQuery } from "@/shared/auth/oidc-query";
import { safeReturnPath } from "@/shared/auth/return-path";
import { callAuth, continueTo } from "@/shared/auth/server-endpoint";
import { redirectToSafePath } from "@/shared/auth/session";
import { parseForm } from "@/shared/validation/field-errors";
import { fieldsOf, text } from "@/shared/validation/form-data";
import {
  SecondFactorMethodSchema,
  VerifyBackupCodeSchema,
  VerifyTotpSchema,
} from "../schemas/two-factor";
import { verifySecondFactor } from "../server/two-factor";
import type { VerifyState } from "../types";

// The second step of a sign-in: no session yet, only Better Auth's pending sign-in cookie, which
// it checks itself. Next has checked the Origin; valibot checks the method and the code.
export async function verifyAction(previous: VerifyState, form: FormData): Promise<VerifyState> {
  const attempt = previous.attempt + 1;
  const method = v.safeParse(SecondFactorMethodSchema, text(form, "method"));
  if (!method.success) return { status: "editing", attempt, error: "Choose how to confirm." };

  const schema = method.output === "totp" ? VerifyTotpSchema : VerifyBackupCodeSchema;
  const parsed = parseForm(schema, fieldsOf(form));
  if (!parsed.ok) return { status: "editing", attempt, error: parsed.errors.code };

  const outcome = await verifySecondFactor(
    withCaptcha(callAuth, captchaToken(form)),
    {
      method: method.output,
      code: parsed.value.code,
      trustDevice: parsed.value.trustDevice ?? false,
    },
    signedOidcQuery(text(form, "oidcQuery")),
  );
  switch (outcome.kind) {
    case "field":
      return { status: "editing", attempt, error: outcome.message };
    case "problem":
      return { status: "editing", attempt, problem: outcome.problem };
    case "continue":
      return { status: "leaving", attempt, url: continueTo(outcome.url).away };
    case "verified":
      return redirectToSafePath(safeReturnPath(text(form, "returnTo")));
  }
}
