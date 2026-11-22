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
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { resendVerificationAction } from "../../actions/sign-up";
import type { ResendVerificationState } from "../../types";

const INITIAL: ResendVerificationState = { status: "editing", attempt: 0, email: "" };

/**
 * Asks for a new confirmation link. The answer is the same whether or not the address is
 * waiting to be confirmed, so it can't be used to find accounts.
 */
export function ResendVerificationForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, INITIAL);

  if (state.status === "sent") {
    return (
      <Alert intent="success" role="status">
        <AlertTitle>Check your email</AlertTitle>
        <AlertDescription>
          If <strong>{state.email}</strong> is waiting to be confirmed, a new link is on its way.
        </AlertDescription>
      </Alert>
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
      <Turnstile />
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Send a new link
      </SubmitButton>
    </AuthForm>
  );
}
