"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  PasswordInput,
} from "@nuvui/react";
import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { changePasswordAction } from "../../actions/password";
import { CHANGE_PASSWORD_FIELDS } from "../../schemas/account";
import type { ChangePasswordState } from "../../types";
import "./change-password-form.scss";

const INITIAL: ChangePasswordState = { attempt: 0, errors: {} };

/**
 * Goes through Better Auth's handler, so the rate limiter applies (5 tries in 5 minutes). Every
 * other session is signed out; this one stays.
 */
export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, INITIAL);
  const { errors } = state;
  return (
    <AuthForm
      key={state.attempt}
      action={action}
      focus={firstInvalidField(errors, CHANGE_PASSWORD_FIELDS)}
    >
      {state.changed ? (
        <Alert intent="success" role="status">
          <AlertTitle>Password changed</AlertTitle>
          <AlertDescription>You've been signed out on every other device.</AlertDescription>
        </Alert>
      ) : null}
      {state.formError ? (
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
      {/* The new password and its repeat side by side, once there's room for both. */}
      <div className="change-password-form__pair">
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
      </div>
      <Turnstile />
      <div className="change-password-form__actions">
        <SubmitButton pending={pending} pendingLabel="Changing…" fill={false}>
          Change password
        </SubmitButton>
      </div>
    </AuthForm>
  );
}
