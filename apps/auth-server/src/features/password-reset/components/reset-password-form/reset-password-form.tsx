"use client";

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  PasswordInput,
} from "@nuvui/react";
import type { Route } from "next";
import { useActionState, useEffect } from "react";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { resetPasswordAction } from "../../actions/password-reset";
import { RESET_PASSWORD_FIELDS } from "../../schemas/password-reset";
import type { ResetPasswordState } from "../../types";

const INITIAL: ResetPasswordState = { status: "editing", attempt: 0, errors: {} };

type ResetPasswordFormProps = {
  token: string;
  /** Where Continue goes once it's done. */
  next: string;
  forgotPasswordHref: Route;
};

/**
 * The new password, typed twice. The token is single-use and lasts 15 minutes; resetting signs
 * the account out everywhere (Better Auth config).
 */
export function ResetPasswordForm({ token, next, forgotPasswordHref }: ResetPasswordFormProps) {
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);

  // Keep the token out of the address bar, history and screenshots once the page has it.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${AUTH_PAGES.resetPassword}?${new URLSearchParams({ next })}`,
    );
  }, [next]);

  if (state.status === "done") {
    return (
      <Alert intent="success" role="status">
        <AlertTitle>Your password is changed</AlertTitle>
        <AlertDescription>
          For safety you've been signed out everywhere. Sign in with your new password.
        </AlertDescription>
        <AlertActions>
          <Button asChild size="sm">
            {/* `next` may be a route handler (an app's authorization request): a plain link. */}
            <a href={next}>Continue</a>
          </Button>
        </AlertActions>
      </Alert>
    );
  }

  if (state.status === "expired") {
    return (
      <Alert intent="warning">
        <AlertTitle>This link has expired or was already used</AlertTitle>
        <AlertDescription>
          Each link works once, for 15 minutes.{" "}
          <TextLink href={forgotPasswordHref}>Get a new link</TextLink>
        </AlertDescription>
      </Alert>
    );
  }

  const { errors } = state;
  return (
    <AuthForm
      key={state.attempt}
      action={action}
      focus={firstInvalidField(errors, RESET_PASSWORD_FIELDS)}
    >
      {/* Out of the address bar, but still needed: the action sends it to Better Auth. */}
      <input type="hidden" name="token" value={token} />
      {state.formError ? (
        <Alert intent="danger">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>New password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
        <FieldError>{errors.password}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Type it again</FieldLabel>
        <FieldControl>
          <PasswordInput name="confirmPassword" autoComplete="new-password" />
        </FieldControl>
        <FieldError>{errors.confirmPassword}</FieldError>
      </Field>
      <SubmitButton pending={pending} pendingLabel="Changing password…">
        Change password
      </SubmitButton>
    </AuthForm>
  );
}
