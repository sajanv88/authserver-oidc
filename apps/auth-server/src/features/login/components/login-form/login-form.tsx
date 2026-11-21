"use client";

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  Input,
  PasswordInput,
} from "@nuvui/react";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { type AuthClientError, authErrorMessage } from "@/shared/auth/auth-errors";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { firstInvalidField, parseForm } from "@/shared/validation/field-errors";
import { LOGIN_FIELDS, type LoginField, LoginSchema } from "../../schemas/login";
import type { LoginContext, LoginProblem, LoginState } from "../../types";
import "./login-form.scss";

function focusField(form: HTMLFormElement, field: LoginField | undefined) {
  const element = field ? form.elements.namedItem(field) : null;
  if (element instanceof HTMLElement) element.focus();
}

/** What a failed sign-in means for the person in front of the form. */
function problemFor(error: AuthClientError & { error?: unknown }, email: string): LoginProblem {
  if (error.status === 403 && error.code === "EMAIL_NOT_VERIFIED")
    return { kind: "unverified", email };
  // The signed authorization query outlived its 10 minutes.
  if (error.error === "invalid_signature") return { kind: "expired" };
  // Wrong password and unknown email get the same words, as they get the same answer.
  if (error.status === 401) return { kind: "message", text: "Email or password is incorrect." };
  return {
    kind: "message",
    text: authErrorMessage(error, "We couldn't sign you in. Try again in a moment."),
  };
}

function Problem({
  problem,
  restartUrl,
}: {
  problem: LoginProblem;
  restartUrl?: string | undefined;
}) {
  switch (problem.kind) {
    case "message":
      return (
        <Alert intent="danger">
          <AlertDescription>{problem.text}</AlertDescription>
        </Alert>
      );
    case "unverified":
      return (
        <Alert intent="warning">
          <AlertTitle>Confirm your email first</AlertTitle>
          <AlertDescription>
            We sent a new link to <strong>{problem.email}</strong>. Open it, then sign in.
          </AlertDescription>
        </Alert>
      );
    case "expired":
      return (
        <Alert intent="warning">
          <AlertTitle>This sign-in request has expired</AlertTitle>
          <AlertDescription>
            Requests from apps are valid for 10 minutes. Start again to get a fresh one.
          </AlertDescription>
          {restartUrl ? (
            <AlertActions>
              <Button asChild intent="secondary" size="sm">
                {/* A route handler, not a page: a plain link. */}
                <a href={restartUrl}>Start again</a>
              </Button>
            </AlertActions>
          ) : null}
        </Alert>
      );
  }
}

/**
 * Email and password. Inside an OIDC flow the browser auth client sends the signed query along,
 * and Better Auth answers with where to go next (consent, or straight back to the app), which
 * its redirect plugin follows. A second factor sends the browser to /two-factor. Otherwise the
 * form goes to returnTo.
 */
export function LoginForm({
  returnTo,
  restartUrl,
  forgotPasswordHref,
}: Pick<LoginContext, "returnTo" | "restartUrl" | "forgotPasswordHref">) {
  const [state, setState] = useState<LoginState>({ status: "editing", errors: {} });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = parseForm(LoginSchema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", errors: parsed.errors });
      focusField(form, firstInvalidField(parsed.errors, LOGIN_FIELDS));
      return;
    }

    setState({ status: "submitting" });
    const { email, password, rememberMe } = parsed.value;
    const { data, error } = await authClient.signIn.email({
      email,
      password,
      rememberMe: rememberMe ?? false,
    });
    if (error) {
      const problem = problemFor(error, email);
      setState({ status: "editing", errors: {}, problem });
      if (problem.kind === "message") focusField(form, "password");
      return;
    }

    setState({ status: "leaving" });
    // Better Auth's client is already navigating: to /two-factor, or on with the OIDC flow.
    if ("twoFactorRedirect" in data && data.twoFactorRedirect) return;
    if ("redirect" in data && data.redirect) return;
    window.location.assign(returnTo);
  }

  const busy = state.status !== "editing";
  const errors = state.status === "editing" ? state.errors : {};
  const problem = state.status === "editing" ? state.problem : undefined;

  return (
    <AuthForm onSubmit={submit}>
      {problem ? <Problem problem={problem} restartUrl={restartUrl} /> : null}
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input type="email" name="email" autoComplete="username" inputMode="email" />
        </FieldControl>
        <FieldError>{errors.email}</FieldError>
      </Field>
      <Field required>
        <div className="login-form__row">
          <FieldLabel>Password</FieldLabel>
          <TextLink href={forgotPasswordHref}>Forgot your password?</TextLink>
        </div>
        <FieldControl>
          <PasswordInput name="password" autoComplete="current-password" />
        </FieldControl>
        <FieldError>{errors.password}</FieldError>
      </Field>
      <Field orientation="horizontal">
        <FieldControl>
          <Checkbox name="rememberMe" />
        </FieldControl>
        <FieldLabel>Keep me signed in on this device</FieldLabel>
      </Field>
      <SubmitButton pending={busy} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </AuthForm>
  );
}
