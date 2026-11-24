"use server";

import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { captchaToken, withCaptcha } from "@/shared/auth/captcha";
import { callAuth } from "@/shared/auth/server-endpoint";
import { requireSession } from "@/shared/auth/session";
import { traceFlow } from "@/shared/telemetry/trace-flow";
import { parseForm } from "@/shared/validation/field-errors";
import { text } from "@/shared/validation/form-data";
import { ConfirmTotpSchema, PasswordConfirmSchema } from "../schemas/two-factor";
import {
  confirmSetup,
  disableTwoFactor,
  regenerateBackupCodes,
  startSetup,
} from "../server/two-factor";
import type { BackupCodesState, DisableState, SetupStep } from "../types";

// The settings dialogs' actions. Each one: the session (Next has checked the Origin), valibot,
// then Better Auth with the browser's session cookie, which asks for the password again.

/**
 * Setting up an authenticator, a step per submission: the password starts it, a code from the
 * app confirms it. The previous step comes back from the form; it only carries what the server
 * itself handed out (the URI and the codes, which are the user's own).
 */
export async function setupAction(previous: SetupStep, form: FormData): Promise<SetupStep> {
  await requireSession(SECURITY_PAGES.twoFactor);
  const attempt = previous.attempt + 1;

  if (previous.step === "scan") {
    const parsed = parseForm(ConfirmTotpSchema, { code: text(form, "code") });
    if (!parsed.ok) return { ...previous, attempt, error: parsed.errors.code };
    const confirmed = await traceFlow("account.two_factor.setup.confirm", () =>
      confirmSetup(withCaptcha(callAuth, captchaToken(form)), parsed.value.code),
    );
    return confirmed.ok
      ? { step: "backup-codes", attempt, backupCodes: previous.backupCodes }
      : { ...previous, attempt, error: confirmed.message };
  }

  const parsed = parseForm(PasswordConfirmSchema, { password: text(form, "password") });
  if (!parsed.ok) return { step: "password", attempt, error: parsed.errors.password };
  const started = await traceFlow("account.two_factor.setup.start", () =>
    startSetup(withCaptcha(callAuth, captchaToken(form)), parsed.value.password, attempt),
  );
  return started.ok
    ? { step: "scan", attempt, totpURI: started.totpURI, backupCodes: started.backupCodes }
    : { step: "password", ...started.failure };
}

export async function backupCodesAction(
  previous: BackupCodesState,
  form: FormData,
): Promise<BackupCodesState> {
  await requireSession(SECURITY_PAGES.twoFactor);
  const attempt = previous.attempt + 1;
  const parsed = parseForm(PasswordConfirmSchema, { password: text(form, "password") });
  if (!parsed.ok) return { status: "password", attempt, error: parsed.errors.password };
  const result = await traceFlow("account.two_factor.backup_codes", () =>
    regenerateBackupCodes(
      withCaptcha(callAuth, captchaToken(form)),
      parsed.value.password,
      attempt,
    ),
  );
  return result.ok
    ? { status: "done", attempt, backupCodes: result.backupCodes }
    : { status: "password", ...result.failure };
}

export async function disableAction(previous: DisableState, form: FormData): Promise<DisableState> {
  await requireSession(SECURITY_PAGES.twoFactor);
  const attempt = previous.attempt + 1;
  const parsed = parseForm(PasswordConfirmSchema, { password: text(form, "password") });
  if (!parsed.ok) return { status: "password", attempt, error: parsed.errors.password };
  const result = await traceFlow("account.two_factor.disable", () =>
    disableTwoFactor(withCaptcha(callAuth, captchaToken(form)), parsed.value.password, attempt),
  );
  return result.ok ? { status: "done", attempt } : { status: "password", ...result.failure };
}
