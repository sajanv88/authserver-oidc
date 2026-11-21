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
import { type FormEvent, useState } from "react";
import { type AuthClientError, authErrorMessage } from "@/shared/auth/auth-errors";
import { parseForm } from "@/shared/validation/field-errors";
import { PasswordConfirmSchema } from "../../schemas/two-factor";
import "./password-form.scss";

type PasswordFormProps = {
  /** What the button does: "Continue", "Turn off two-factor". */
  submitLabel: string;
  pendingLabel: string;
  intent?: "primary" | "danger";
  /** Runs the change with the password; resolves to Better Auth's error, if any. */
  onConfirm: (password: string) => Promise<AuthClientError | null | undefined>;
};

/**
 * Asks for the account password before a two-factor change, inside a Dialog. A wrong password
 * stays a field error; anything else is a message.
 */
export function PasswordForm({
  submitLabel,
  pendingLabel,
  intent = "primary",
  onConfirm,
}: PasswordFormProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(PasswordConfirmSchema, Object.fromEntries(new FormData(form)));
    setFormError(undefined);
    if (!parsed.ok) {
      setError(parsed.errors.password);
      form.querySelector<HTMLInputElement>("input[name=password]")?.focus();
      return;
    }
    setPending(true);
    const failure = await onConfirm(parsed.value.password);
    setPending(false);
    if (!failure) return;
    if (failure.code === "INVALID_PASSWORD") {
      setError("That isn't your password.");
      form.querySelector<HTMLInputElement>("input[name=password]")?.focus();
      return;
    }
    setError(undefined);
    setFormError(authErrorMessage(failure, "That didn't work. Try again in a moment."));
  }

  return (
    <form className="password-form" noValidate onSubmit={submit}>
      {formError ? (
        <Alert intent="danger">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Your password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="current-password" />
        </FieldControl>
        <FieldError>{error}</FieldError>
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
    </form>
  );
}
