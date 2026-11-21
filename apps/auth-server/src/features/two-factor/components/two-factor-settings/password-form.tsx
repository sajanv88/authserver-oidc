"use client";

import {
  Alert,
  AlertDescription,
  Button,
  DialogClose,
  DialogFooter,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  PasswordInput,
  Spinner,
} from "@nuvui/react";
import Form from "next/form";
import { useEffect, useRef } from "react";
import type { PasswordAttempt } from "../../types";
import "./password-form.scss";

type PasswordFormProps = {
  /** The dialog's server action, as `useActionState` hands it back. */
  action: (formData: FormData) => void;
  pending: boolean;
  /** What the last attempt came to: a field error, or a message for the form. */
  attempt: PasswordAttempt;
  /** What the button does: "Continue", "Turn off two-factor". */
  submitLabel: string;
  pendingLabel: string;
  intent?: "primary" | "danger";
};

/**
 * Asks for the account password before a two-factor change, inside a Dialog. The server action
 * checks it (through Better Auth); a wrong password stays a field error, anything else is a
 * message. Key it by the attempt.
 */
export function PasswordForm({
  action,
  pending,
  attempt,
  submitLabel,
  pendingLabel,
  intent = "primary",
}: PasswordFormProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (attempt.error) input.current?.focus();
  }, [attempt.error]);

  return (
    <Form action={action} className="password-form" noValidate>
      {attempt.formError ? (
        <Alert intent="danger">
          <AlertDescription>{attempt.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Your password</FieldLabel>
        <FieldControl>
          <PasswordInput ref={input} name="password" autoComplete="current-password" />
        </FieldControl>
        <FieldError>{attempt.error}</FieldError>
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button intent="secondary" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" intent={intent} disabled={pending}>
          {pending ? (
            <>
              <Spinner size="sm" label="" />
              {pendingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </DialogFooter>
    </Form>
  );
}
