"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Checkbox,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  OtpField,
} from "@nuvui/react";
import type { Route } from "next";
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { LeavingFor } from "@/shared/ui/leaving-for/leaving-for";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { verifyAction } from "../../actions/verify";
import type { SecondFactorMethod, VerifyProblem, VerifyState } from "../../types";

function Problem({ problem, loginHref }: { problem: VerifyProblem; loginHref: Route }) {
  if (problem.kind === "expired") {
    return (
      <Alert intent="warning">
        <AlertTitle>Your sign-in timed out</AlertTitle>
        <AlertDescription>
          The second step has to follow the first within 10 minutes.{" "}
          <TextLink href={loginHref}>Sign in again</TextLink>
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert intent="danger">
      <AlertDescription>{problem.text}</AlertDescription>
    </Alert>
  );
}

const INITIAL: VerifyState = { status: "editing", attempt: 0 };

type VerifyFormProps = {
  method: SecondFactorMethod;
  oidcQuery: string;
  returnTo: string;
  loginHref: Route;
};

/**
 * The second step of signing in, checked by the server action. Inside an OIDC flow the signed
 * query goes along and Better Auth continues to consent (a page here) or the app (another site,
 * so the form navigates there). Otherwise on to returnTo.
 */
export function VerifyForm({ method, oidcQuery, returnTo, loginHref }: VerifyFormProps) {
  const [state, action, pending] = useActionState(verifyAction, INITIAL);

  if (state.status === "leaving") return <LeavingFor url={state.url} />;
  const { error, problem } = state;

  return (
    <AuthForm key={state.attempt} action={action} focus={error ? "code" : undefined}>
      <input type="hidden" name="method" value={method} />
      <input type="hidden" name="oidcQuery" value={oidcQuery} />
      <input type="hidden" name="returnTo" value={returnTo} />
      {problem ? <Problem problem={problem} loginHref={loginHref} /> : null}
      {method === "totp" ? (
        <Field required>
          {/* A row of boxes isn't something a <label> can point at. */}
          <FieldLabel asChild>
            <span>Code from your authenticator app</span>
          </FieldLabel>
          <FieldControl>
            <OtpField name="code" groupSize={3} autoComplete="one-time-code" />
          </FieldControl>
          <FieldDescription>It changes every 30 seconds.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      ) : (
        <Field required>
          <FieldLabel>Backup code</FieldLabel>
          <FieldControl>
            <Input
              name="code"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="xxxxx-xxxxx"
            />
          </FieldControl>
          <FieldDescription>Each backup code works once.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field>
      )}
      <Field orientation="horizontal">
        <FieldControl>
          <Checkbox name="trustDevice" />
        </FieldControl>
        <FieldLabel>Don't ask again on this device for 30 days</FieldLabel>
      </Field>
      <SubmitButton pending={pending} pendingLabel="Checking…">
        Verify
      </SubmitButton>
    </AuthForm>
  );
}
