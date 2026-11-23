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
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { APP_NAME } from "@/shared/config/app";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { setupAction } from "../../actions/settings";
import type { SetupStep } from "../../types";
import { BackupCodesList } from "./backup-codes-list";
import "./enable-dialog.scss";
import { PasswordForm } from "./password-form";
import { setupKeyFrom } from "./setup-key";

const INITIAL: SetupStep = { step: "password", attempt: 0 };

/** The dialog's content, one step per server action answer. Mounted only while it's open. */
function SetupPanel({ onEnabled, onFinish }: { onEnabled: () => void; onFinish: () => void }) {
  const [setup, action, pending] = useActionState(setupAction, INITIAL);
  const codeField = useRef<HTMLFormElement>(null);
  // Two-factor is on from the moment the code is accepted, however the dialog is then closed.
  useEffect(() => {
    if (setup.step === "backup-codes") onEnabled();
  }, [setup.step, onEnabled]);
  useEffect(() => {
    if (setup.step === "scan" && setup.error) {
      codeField.current?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
    }
  }, [setup]);

  if (setup.step === "password") {
    return (
      <>
        <DialogTitle>Set up two-factor authentication</DialogTitle>
        <DialogDescription>
          You'll need an authenticator app, such as 1Password, Google Authenticator or Authy. First,
          confirm your password.
        </DialogDescription>
        <PasswordForm
          key={setup.attempt}
          action={action}
          pending={pending}
          attempt={setup}
          submitLabel="Continue"
          pendingLabel="Checking…"
        />
      </>
    );
  }

  if (setup.step === "scan") {
    return (
      <>
        <DialogTitle>Add this account to your app</DialogTitle>
        <DialogDescription>
          Scan the code with your authenticator app, or type the setup key into it. Then enter the
          6-digit code it shows.
        </DialogDescription>
        <Form
          key={setup.attempt}
          ref={codeField}
          action={action}
          className="enable-dialog"
          noValidate
        >
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
          <Turnstile />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner size="sm" label="" />
                  Checking…
                </>
              ) : (
                "Turn on two-factor"
              )}
            </Button>
          </DialogFooter>
        </Form>
      </>
    );
  }

  return (
    <>
      <DialogTitle>Save your backup codes</DialogTitle>
      <DialogDescription>
        If you lose your phone, each of these signs you in once instead of an app code. They won't
        be shown again.
      </DialogDescription>
      <Alert intent="success" role="status">
        <AlertDescription>Two-factor authentication is on.</AlertDescription>
      </Alert>
      <BackupCodesList codes={setup.backupCodes} />
      <DialogFooter>
        <Button type="button" onClick={onFinish}>
          I've saved them
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Turning two-factor on: the password, then the authenticator (QR code, or the setup key typed
 * in) confirmed with a code, then the backup codes. Two-factor is only on once a code from the
 * new authenticator has been accepted, so a half-finished setup locks nobody out.
 *
 * `available`: two-factor is off, so the button shows. Once it's on, the dialog stays open
 * until the backup codes have been seen.
 */
export function EnableDialog({ available }: { available: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const finished = useRef(false);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      finished.current = false;
      return;
    }
    // Closing after the codes were shown: the account has two-factor now.
    if (finished.current) {
      toast("Two-factor authentication is on", { intent: "success" });
      router.refresh();
    }
  }

  if (!available && !open) return null;
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      {available ? (
        <DialogTrigger asChild>
          <Button>Set up two-factor</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <SetupPanel
          onEnabled={() => {
            finished.current = true;
          }}
          onFinish={() => changeOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
