"use client";

import { QRCode } from "@nuvui/barcodes";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  OtpField,
  Spinner,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { APP_NAME } from "@/shared/config/app";
import { parseForm } from "@/shared/validation/field-errors";
import { ConfirmTotpSchema } from "../../schemas/two-factor";
import type { SetupStep } from "../../types";
import { BackupCodesList } from "./backup-codes-list";
import "./enable-dialog.scss";
import { PasswordForm } from "./password-form";
import { setupKeyFrom } from "./setup-key";

/**
 * Turning two-factor on: the password, then the authenticator (QR code, or the setup key typed
 * in) confirmed with a code, then the backup codes. Two-factor is only on once a code from the
 * new authenticator has been accepted, so a half-finished setup locks nobody out.
 */
export function EnableDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [setup, setSetup] = useState<SetupStep>({ step: "password" });
  const [confirming, setConfirming] = useState(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) return;
    // Closing after the codes were shown: the account has two-factor now.
    if (setup.step === "backup-codes") {
      toast("Two-factor authentication is on", { intent: "success" });
      router.refresh();
    }
    setSetup({ step: "password" });
  }

  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (setup.step !== "scan") return;
    const form = event.currentTarget;
    const parsed = parseForm(ConfirmTotpSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setSetup({ ...setup, error: parsed.errors.code });
      form.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
      return;
    }
    setConfirming(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: parsed.value.code });
    setConfirming(false);
    if (error) {
      setSetup({
        ...setup,
        error:
          error.code === "INVALID_CODE"
            ? "That code didn't match. Check the app added this account, and enter its current code."
            : authErrorMessage(error, "We couldn't check the code. Try again in a moment."),
      });
      return;
    }
    setSetup({ step: "backup-codes", backupCodes: setup.backupCodes });
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button>Set up two-factor</Button>
      </DialogTrigger>
      <DialogContent>
        {setup.step === "password" ? (
          <>
            <DialogTitle>Set up two-factor authentication</DialogTitle>
            <DialogDescription>
              You'll need an authenticator app, such as 1Password, Google Authenticator or Authy.
              First, confirm your password.
            </DialogDescription>
            <PasswordForm
              submitLabel="Continue"
              pendingLabel="Checking…"
              onConfirm={async (password) => {
                const { data, error } = await authClient.twoFactor.enable({ password });
                if (error) return error;
                if (data && "totpURI" in data) {
                  setSetup({ step: "scan", totpURI: data.totpURI, backupCodes: data.backupCodes });
                }
                return null;
              }}
            />
          </>
        ) : null}

        {setup.step === "scan" ? (
          <>
            <DialogTitle>Add this account to your app</DialogTitle>
            <DialogDescription>
              Scan the code with your authenticator app, or type the setup key into it. Then enter
              the 6-digit code it shows.
            </DialogDescription>
            <form className="enable-dialog" noValidate onSubmit={confirmCode}>
              <div className="enable-dialog__key">
                <QRCode
                  value={setup.totpURI}
                  size={176}
                  aria-label={`Add ${APP_NAME} to your authenticator app`}
                />
                <div className="enable-dialog__manual">
                  <p className="enable-dialog__label">Setup key</p>
                  <code className="enable-dialog__secret">{setupKeyFrom(setup.totpURI)}</code>
                  <p className="enable-dialog__hint">Time-based, 6 digits, every 30 seconds.</p>
                </div>
              </div>
              <Field required>
                <FieldLabel asChild>
                  <span>Code from the app</span>
                </FieldLabel>
                <FieldControl>
                  <OtpField name="code" groupSize={3} autoComplete="one-time-code" />
                </FieldControl>
                <FieldDescription>Two-factor turns on once this code is accepted.</FieldDescription>
                <FieldError>{setup.error}</FieldError>
              </Field>
              <DialogFooter>
                <Button type="submit" disabled={confirming}>
                  {confirming ? (
                    <>
                      <Spinner size="sm" label="" />
                      Checking…
                    </>
                  ) : (
                    "Turn on two-factor"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : null}

        {setup.step === "backup-codes" ? (
          <>
            <DialogTitle>Save your backup codes</DialogTitle>
            <DialogDescription>
              If you lose your phone, each of these signs you in once instead of an app code. They
              won't be shown again.
            </DialogDescription>
            <Alert intent="success" role="status">
              <AlertDescription>Two-factor authentication is on.</AlertDescription>
            </Alert>
            <BackupCodesList codes={setup.backupCodes} />
            <DialogFooter>
              <Button type="button" onClick={() => changeOpen(false)}>
                I've saved them
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
