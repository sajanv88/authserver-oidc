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
import { parseForm } from "@/shared/validation/field-errors";
import { ResendVerificationSchema } from "../../schemas/signup";

type State =
  | { status: "editing"; error?: string | undefined; formError?: string | undefined }
  | { status: "submitting" }
  | { status: "sent"; email: string };

/**
 * Asks for a new confirmation link. The answer is the same whether or not the address is
 * waiting to be confirmed, so it can't be used to find accounts.
 */
export function ResendVerificationForm({ next }: { next: string }) {
  const [state, setState] = useState<State>({ status: "editing" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(ResendVerificationSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", error: parsed.errors.email });
      const input = form.elements.namedItem("email");
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    setState({ status: "submitting" });
    const { error } = await authClient.sendVerificationEmail({
      email: parsed.value.email,
      callbackURL: `${AUTH_PAGES.verifyEmail}?${new URLSearchParams({ next })}`,
    });
    if (error && error.status === 429) {
      setState({ status: "editing", formError: authErrorMessage(error, "") });
      return;
    }
    setState({ status: "sent", email: parsed.value.email });
  }

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
        Send a new link
      </SubmitButton>
    </AuthForm>
  );
}
