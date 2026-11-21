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
import { type FormEvent, useEffect, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { firstInvalidField, parseForm } from "@/shared/validation/field-errors";
import {
  mismatchErrors,
  RESET_PASSWORD_FIELDS,
  type ResetPasswordField,
  ResetPasswordSchema,
} from "../../schemas/password-reset";
import type { ResetPasswordState } from "../../types";

function focusField(form: HTMLFormElement, field: ResetPasswordField | undefined) {
  const element = field ? form.elements.namedItem(field) : null;
  if (element instanceof HTMLElement) element.focus();
}

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
  const [state, setState] = useState<ResetPasswordState>({ status: "editing", errors: {} });

  // Keep the token out of the address bar, history and screenshots once the page has it.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      `${AUTH_PAGES.resetPassword}?${new URLSearchParams({ next })}`,
    );
  }, [next]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(ResetPasswordSchema, Object.fromEntries(new FormData(form)));
    const errors = parsed.ok ? mismatchErrors(parsed.value) : parsed.errors;
    if (!parsed.ok || Object.keys(errors).length > 0) {
      setState({ status: "editing", errors });
      focusField(form, firstInvalidField(errors, RESET_PASSWORD_FIELDS));
      return;
    }

    setState({ status: "submitting" });
    const { error } = await authClient.resetPassword({ newPassword: parsed.value.password, token });
    if (!error) {
      setState({ status: "done" });
      return;
    }
    if (error.code === "INVALID_TOKEN") {
      setState({ status: "expired" });
      return;
    }
    if (error.code === "PASSWORD_TOO_SHORT" || error.code === "PASSWORD_TOO_LONG") {
      setState({
        status: "editing",
        errors: { password: `Use ${PASSWORD_MIN_LENGTH} to 128 characters.` },
      });
      focusField(form, "password");
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

  const errors = state.status === "editing" ? state.errors : {};
  return (
    <AuthForm onSubmit={submit}>
      {state.status === "editing" && state.formError ? (
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
      <SubmitButton pending={state.status === "submitting"} pendingLabel="Changing password…">
        Change password
      </SubmitButton>
    </AuthForm>
  );
}
