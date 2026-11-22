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
  PasswordInput,
} from "@nuvui/react";
import type { Route } from "next";
import { useActionState } from "react";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { signUpAction } from "../../actions/sign-up";
import { SIGN_UP_FIELDS } from "../../schemas/signup";
import type { SignUpState } from "../../types";
import "./sign-up-form.scss";

const INITIAL: SignUpState = {
  status: "editing",
  attempt: 0,
  values: { name: "", email: "" },
  errors: {},
};

/**
 * Name, email and a new password, checked and sent by the server action. On success it says to
 * check the inbox, whatever the address: the server answers an existing address exactly like a
 * new one (and emails its owner).
 */
export function SignUpForm({ next, retryHref }: { next: string; retryHref: Route }) {
  const [state, action, pending] = useActionState(signUpAction, INITIAL);

  if (state.status === "sent") {
    return (
      <div className="sign-up-form__sent">
        <Alert intent="success" role="status">
          <AlertTitle>Check your email</AlertTitle>
          <AlertDescription>
            We sent a link to <strong>{state.email}</strong>. Open it to confirm your address and
            finish signing up. It works for 60 minutes.
          </AlertDescription>
        </Alert>
        <p className="sign-up-form__note">
          Wrong address? <TextLink href={retryHref}>Use a different email</TextLink>
        </p>
      </div>
    );
  }

  return (
    <AuthForm
      key={state.attempt}
      action={action}
      focus={firstInvalidField(state.errors, SIGN_UP_FIELDS)}
    >
      <input type="hidden" name="next" value={next} />
      {state.formError ? (
        <Alert intent="danger">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Name</FieldLabel>
        <FieldControl>
          <Input name="name" autoComplete="name" defaultValue={state.values.name} />
        </FieldControl>
        <FieldError>{state.errors.name}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            defaultValue={state.values.email}
          />
        </FieldControl>
        <FieldError>{state.errors.email}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
        <FieldError>{state.errors.password}</FieldError>
      </Field>
      <Turnstile />
      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </AuthForm>
  );
}
