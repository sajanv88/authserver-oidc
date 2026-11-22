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
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { LeavingFor } from "@/shared/ui/leaving-for/leaving-for";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { signInAction } from "../../actions/sign-in";
import { LOGIN_FIELDS } from "../../schemas/login";
import type { LoginContext, LoginProblem, LoginState } from "../../types";
import "./login-form.scss";

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

const INITIAL: LoginState = { status: "editing", attempt: 0, email: "", errors: {} };

/**
 * Email and password, checked by the server action. Inside an OIDC flow the signed query goes
 * along, and Better Auth answers with where to go next: consent (a page here) or straight back
 * to the app (another site, so the form navigates there). A second factor goes on to
 * /two-factor. Otherwise on to returnTo.
 */
export function LoginForm({
  oidcQuery,
  returnTo,
  restartUrl,
  forgotPasswordHref,
}: Pick<LoginContext, "oidcQuery" | "returnTo" | "restartUrl" | "forgotPasswordHref">) {
  const [state, action, pending] = useActionState(signInAction, INITIAL);

  if (state.status === "leaving") return <LeavingFor url={state.url} />;

  const { errors, problem } = state;
  const focus =
    firstInvalidField(errors, LOGIN_FIELDS) ??
    (problem?.kind === "message" ? "password" : undefined);

  return (
    <AuthForm key={state.attempt} action={action} focus={focus}>
      <input type="hidden" name="oidcQuery" value={oidcQuery} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {problem ? <Problem problem={problem} restartUrl={restartUrl} /> : null}
      <Field required>
        <FieldLabel>Email</FieldLabel>
        <FieldControl>
          <Input
            type="email"
            name="email"
            autoComplete="username"
            inputMode="email"
            defaultValue={state.email}
          />
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
      <Turnstile />
      <SubmitButton pending={pending} pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </AuthForm>
  );
}
