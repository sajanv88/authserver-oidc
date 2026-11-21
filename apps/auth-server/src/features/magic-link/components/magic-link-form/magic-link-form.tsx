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
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { requestMagicLinkAction } from "../../actions/magic-link";
import type { MagicLinkContext, MagicLinkState } from "../../types";
import "./magic-link-form.scss";

const INITIAL: MagicLinkState = { status: "editing", attempt: 0, email: "" };

/**
 * Asks for a sign-in link, through the server action. Whatever the address, the answer is the
 * same: the server sends nothing to unknown addresses or accounts with two-factor on.
 */
export function MagicLinkForm({
  callbackURL,
  errorCallbackURL,
  retryHref,
}: Pick<MagicLinkContext, "callbackURL" | "errorCallbackURL" | "retryHref">) {
  const [state, action, pending] = useActionState(requestMagicLinkAction, INITIAL);

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
          Nothing arrived? <TextLink href={retryHref}>Try again</TextLink>
        </p>
      </div>
    );
  }

  return (
    <AuthForm key={state.attempt} action={action} focus={state.error ? "email" : undefined}>
      <input type="hidden" name="callbackURL" value={callbackURL} />
      <input type="hidden" name="errorCallbackURL" value={errorCallbackURL} />
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
        <FieldDescription>
          Accounts with two-factor authentication sign in with their password.
        </FieldDescription>
        <FieldError>{state.error}</FieldError>
      </Field>
      <SubmitButton pending={pending} pendingLabel="Sending…">
        Email me a link
      </SubmitButton>
    </AuthForm>
  );
}
