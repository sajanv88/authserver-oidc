"use client";

import {
  Alert,
  AlertDescription,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  PasswordInput,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { firstInvalidField, parseForm } from "@/shared/validation/field-errors";
import {
  CHANGE_PASSWORD_FIELDS,
  type ChangePasswordField,
  ChangePasswordSchema,
  crossFieldErrors,
} from "../../schemas/account";
import type { ChangePasswordState } from "../../types";

function focusField(form: HTMLFormElement, field: ChangePasswordField | undefined) {
  const element = field ? form.elements.namedItem(field) : null;
  if (element instanceof HTMLElement) element.focus();
}

/**
 * The current password, then the new one twice. Through the browser auth client, so the rate
 * limiter applies (5 tries in 5 minutes). Every other session is signed out; this one stays.
 */
export function ChangePasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<ChangePasswordState>({ status: "editing", errors: {} });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(ChangePasswordSchema, Object.fromEntries(new FormData(form)));
    const errors = parsed.ok ? crossFieldErrors(parsed.value) : parsed.errors;
    if (!parsed.ok || Object.keys(errors).length > 0) {
      setState({ status: "editing", errors });
      focusField(form, firstInvalidField(errors, CHANGE_PASSWORD_FIELDS));
      return;
    }

    setState({ status: "submitting" });
    const { error } = await authClient.changePassword({
      currentPassword: parsed.value.currentPassword,
      newPassword: parsed.value.newPassword,
      revokeOtherSessions: true,
    });
    if (!error) {
      form.reset();
      setState({ status: "editing", errors: {} });
      toast("Password changed", {
        intent: "success",
        description: "You've been signed out on every other device.",
      });
      // The session list below now has this session only.
      router.refresh();
      return;
    }
    if (error.code === "INVALID_PASSWORD") {
      setState({
        status: "editing",
        errors: { currentPassword: "That isn't your current password." },
      });
      focusField(form, "currentPassword");
      return;
    }
    if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
      setState({
        status: "editing",
        errors: {
          newPassword: `Use ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
        },
      });
      focusField(form, "newPassword");
      return;
    }
    setState({
      status: "editing",
      errors: {},
      formError: authErrorMessage(
        error,
        "We couldn't change your password. Try again in a moment.",
      ),
    });
  }

  const errors = state.status === "editing" ? state.errors : {};
  return (
    <AuthForm onSubmit={submit}>
      {state.status === "editing" && state.formError ? (
        <Alert intent="danger">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Current password</FieldLabel>
        <FieldControl>
          <PasswordInput name="currentPassword" autoComplete="current-password" />
        </FieldControl>
        <FieldError>{errors.currentPassword}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>New password</FieldLabel>
        <FieldControl>
          <PasswordInput name="newPassword" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
        <FieldError>{errors.newPassword}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Type it again</FieldLabel>
        <FieldControl>
          <PasswordInput name="confirmPassword" autoComplete="new-password" />
        </FieldControl>
        <FieldError>{errors.confirmPassword}</FieldError>
      </Field>
      <SubmitButton pending={state.status === "submitting"} pendingLabel="Changing…">
        Change password
      </SubmitButton>
    </AuthForm>
  );
}
