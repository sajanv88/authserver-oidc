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
  Input,
} from "@nuvui/react";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextButton } from "@/shared/ui/text-link/text-link";
import { parseForm } from "@/shared/validation/field-errors";
import { MagicLinkSchema } from "../../schemas/magic-link";
import type { MagicLinkContext, MagicLinkState } from "../../types";
import "./magic-link-form.scss";

/**
 * Asks for a sign-in link. Whatever the address, the answer is the same: Better Auth answers
 * alike, and the server sends nothing to unknown addresses or accounts with two-factor on.
 */
export function MagicLinkForm({
  callbackURL,
  errorCallbackURL,
}: Pick<MagicLinkContext, "callbackURL" | "errorCallbackURL">) {
  const [state, setState] = useState<MagicLinkState>({ status: "editing" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(MagicLinkSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", error: parsed.errors.email });
      const input = form.elements.namedItem("email");
      if (input instanceof HTMLElement) input.focus();
      return;
    }

    setState({ status: "submitting" });
    const { error } = await authClient.signIn.magicLink({
      email: parsed.value.email,
      callbackURL,
      errorCallbackURL,
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
      <div className="magic-link-form__sent">
        <Alert intent="success" role="status">
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            If <strong>{state.email}</strong> has an account, we sent it a sign-in link. It works
            once, for 5 minutes, in this browser or any other.
          </AlertDescription>
        </Alert>
        <p className="magic-link-form__note">
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
        <FieldDescription>
          Accounts with two-factor authentication sign in with their password.
        </FieldDescription>
        <FieldError>{state.status === "editing" ? state.error : undefined}</FieldError>
      </Field>
      <SubmitButton pending={state.status === "submitting"} pendingLabel="Sending…">
        Email me a link
      </SubmitButton>
    </AuthForm>
  );
}
