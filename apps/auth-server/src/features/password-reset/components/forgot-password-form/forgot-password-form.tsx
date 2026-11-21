"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  Input,
} from "@nuvui/react";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextButton } from "@/shared/ui/text-link/text-link";
import { parseForm } from "@/shared/validation/field-errors";
import { ForgotPasswordSchema } from "../../schemas/password-reset";
import type { ForgotPasswordState, ResetDestination } from "../../types";
import "./forgot-password-form.scss";

/**
 * Asks for a reset link. The answer is the same whether or not the address has an account:
 * Better Auth answers alike, and so does this page.
 */
export function ForgotPasswordForm({ next }: ResetDestination) {
  const [state, setState] = useState<ForgotPasswordState>({ status: "editing" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(ForgotPasswordSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", error: parsed.errors.email });
      const input = form.elements.namedItem("email");
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    setState({ status: "submitting" });
    const { error } = await authClient.requestPasswordReset({
      email: parsed.value.email,
      // The emailed link lands here with ?token= added, keeping `next`.
      redirectTo: `${AUTH_PAGES.resetPassword}?${new URLSearchParams({ next })}`,
    });
    if (error) {
      setState({
        status: "editing",
        formError: authErrorMessage(error, "We couldn't send the link. Try again in a moment."),
      });
      return;
    }
    setState({ status: "sent", email: parsed.value.email });
  }

  if (state.status === "sent") {
    return (
      <div className="forgot-password-form__sent">
        <Alert intent="success" role="status">
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If <strong>{state.email}</strong> has an account, we sent it a link to choose a new
            password. It works once, for 15 minutes.
          </AlertDescription>
        </Alert>
        <p className="forgot-password-form__note">
          Nothing arrived?{" "}
          <TextButton onClick={() => setState({ status: "editing" })}>Try again</TextButton>
        </p>
      </div>
    );
  }

  return (
    <AuthForm onSubmit={submit}>
      {state.status === "editing" && state.formError ? (
        <Alert intent="danger">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="email" inputMode="email" />
        </FieldControl>
        <FieldError>{state.status === "editing" ? state.error : undefined}</FieldError>
      </Field>
      <SubmitButton pending={state.status === "submitting"} pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </AuthForm>
  );
}
