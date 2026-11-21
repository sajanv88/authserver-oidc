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
import type { Route } from "next";
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { requestResetAction } from "../../actions/password-reset";
import type { ForgotPasswordState, ResetDestination } from "../../types";
import "./forgot-password-form.scss";

const INITIAL: ForgotPasswordState = { status: "editing", attempt: 0, email: "" };

/**
 * Asks for a reset link. The answer is the same whether or not the address has an account:
 * Better Auth answers alike, and so does this page.
 */
export function ForgotPasswordForm({ next, retryHref }: ResetDestination & { retryHref: Route }) {
  const [state, action, pending] = useActionState(requestResetAction, INITIAL);

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
          Nothing arrived? <TextLink href={retryHref}>Try again</TextLink>
        </p>
      </div>
    );
  }

  return (
    <AuthForm key={state.attempt} action={action} focus={state.error ? "email" : undefined}>
      <input type="hidden" name="next" value={next} />
      {state.formError ? (
        <Alert intent="danger">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={state.email}
          />
        </FieldControl>
        <FieldError>{state.error}</FieldError>
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send reset link
      </SubmitButton>
    </AuthForm>
  );
}
