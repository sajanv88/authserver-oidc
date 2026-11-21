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
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { authErrorMessage } from "@/shared/auth/auth-errors";
import { AUTH_PAGES } from "@/shared/auth/auth-pages";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextButton } from "@/shared/ui/text-link/text-link";
import { firstInvalidField, parseForm } from "@/shared/validation/field-errors";
import { SIGN_UP_FIELDS, type SignUpField, SignUpSchema } from "../../schemas/signup";
import type { SignUpContext, SignUpState } from "../../types";
import "./sign-up-form.scss";

/** Better Auth's codes for problems with one field, and which field. */
const FIELD_CODES: Record<string, [SignUpField, string]> = {
  PASSWORD_TOO_SHORT: ["password", `Use at least ${PASSWORD_MIN_LENGTH} characters.`],
  PASSWORD_TOO_LONG: ["password", "Use a shorter password."],
  INVALID_EMAIL: ["email", "Enter an email address like name@example.com."],
};

function focusField(form: HTMLFormElement, field: SignUpField | undefined) {
  const element = field ? form.elements.namedItem(field) : null;
  if (element instanceof HTMLElement) element.focus();
}

/**
 * Name, email and a new password. On success it says to check the inbox, whatever the address:
 * the server answers an existing address exactly like a new one (and emails its owner).
 */
export function SignUpForm({ next }: Pick<SignUpContext, "next">) {
  const [state, setState] = useState<SignUpState>({ status: "editing", errors: {} });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(SignUpSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", errors: parsed.errors });
      focusField(form, firstInvalidField(parsed.errors, SIGN_UP_FIELDS));
      return;
    }

    setState({ status: "submitting" });
    const { error } = await authClient.signUp.email({
      ...parsed.value,
      // The confirmation link lands here, signed in, then goes on to `next`.
      callbackURL: `${AUTH_PAGES.verifyEmail}?${new URLSearchParams({ next })}`,
    });
    if (!error) {
      setState({ status: "sent", email: parsed.value.email });
      return;
    }
    const fieldError = error.code ? FIELD_CODES[error.code] : undefined;
    if (fieldError) {
      const [field, message] = fieldError;
      setState({ status: "editing", errors: { [field]: message } });
      focusField(form, field);
      return;
    }
    setState({
      status: "editing",
      errors: {},
      formError: authErrorMessage(error, "We couldn't create your account. Try again in a moment."),
    });
  }

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
          Wrong address?{" "}
          <TextButton onClick={() => setState({ status: "editing", errors: {} })}>
            Use a different email
          </TextButton>
        </p>
      </div>
    );
  }

  const pending = state.status === "submitting";
  const errors = state.status === "editing" ? state.errors : {};
  const formError = state.status === "editing" ? state.formError : undefined;

  return (
    <AuthForm onSubmit={submit}>
      {formError ? (
        <Alert intent="danger">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <Field required>
        <FieldLabel>Name</FieldLabel>
        <FieldControl>
          <Input name="name" autoComplete="name" />
        </FieldControl>
        <FieldError>{errors.name}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="email" inputMode="email" />
        </FieldControl>
        <FieldError>{errors.email}</FieldError>
      </Field>
      <Field required>
        <FieldLabel>Password</FieldLabel>
        <FieldControl>
          <PasswordInput name="password" autoComplete="new-password" />
        </FieldControl>
        <FieldDescription>At least {PASSWORD_MIN_LENGTH} characters.</FieldDescription>
        <FieldError>{errors.password}</FieldError>
      </Field>
      <SubmitButton pending={pending} pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </AuthForm>
  );
}
