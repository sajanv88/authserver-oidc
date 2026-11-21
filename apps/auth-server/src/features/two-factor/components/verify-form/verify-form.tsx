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
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { type AuthClientError, authErrorMessage } from "@/shared/auth/auth-errors";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { parseForm } from "@/shared/validation/field-errors";
import { VerifyBackupCodeSchema, VerifyTotpSchema } from "../../schemas/two-factor";
import type { SecondFactorMethod, VerifyProblem, VerifyState } from "../../types";

const WRONG_CODE: Record<SecondFactorMethod, string> = {
  totp: "That code didn't match. Check the app shows this account, and try the current code.",
  backup: "That backup code didn't match, or it was already used.",
};

/** What a failed verification means here: a field message, or a problem with the sign-in. */
function outcome(
  error: AuthClientError,
  method: SecondFactorMethod,
): { field?: string; problem?: VerifyProblem } {
  if (error.code === "INVALID_CODE" || error.code === "INVALID_BACKUP_CODE") {
    return { field: WRONG_CODE[method] };
  }
  if (error.code === "INVALID_TWO_FACTOR_COOKIE") return { problem: { kind: "expired" } };
  if (error.code === "ACCOUNT_TEMPORARILY_LOCKED") {
    return {
      problem: {
        kind: "message",
        text: "Too many wrong codes. For your safety, wait 15 minutes, then try again.",
      },
    };
  }
  return {
    problem: {
      kind: "message",
      text: authErrorMessage(error, "We couldn't check the code. Try again in a moment."),
    },
  };
}

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

type VerifyFormProps = {
  method: SecondFactorMethod;
  returnTo: string;
  loginHref: Route;
};

/**
 * The second step of signing in. Inside an OIDC flow, the browser auth client sends the signed
 * query along (it's on this page's URL) and Better Auth continues to consent or the app, which
 * its redirect plugin follows. Otherwise the form goes on to returnTo.
 */
export function VerifyForm({ method, returnTo, loginHref }: VerifyFormProps) {
  const [state, setState] = useState<VerifyState>({ status: "editing" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const schema = method === "totp" ? VerifyTotpSchema : VerifyBackupCodeSchema;
    const parsed = parseForm(schema, Object.fromEntries(new FormData(form)));
    if (!parsed.ok) {
      setState({ status: "editing", error: parsed.errors.code });
      form.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
      return;
    }

    setState({ status: "submitting" });
    const body = { code: parsed.value.code, trustDevice: parsed.value.trustDevice ?? false };
    const { data, error } =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp(body)
        : await authClient.twoFactor.verifyBackupCode(body);
    if (error) {
      const { field, problem } = outcome(error, method);
      setState({ status: "editing", error: field, problem });
      return;
    }

    setState({ status: "leaving" });
    // Better Auth's client follows an OIDC continuation itself.
    if (data && "redirect" in data && data.redirect) return;
    window.location.assign(returnTo);
  }

  const error = state.status === "editing" ? state.error : undefined;
  const problem = state.status === "editing" ? state.problem : undefined;

  return (
    <AuthForm onSubmit={submit}>
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
      <SubmitButton pending={state.status !== "editing"} pendingLabel="Checking…">
        Verify
      </SubmitButton>
    </AuthForm>
  );
}
