"use client";

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import Form from "next/form";
import { useActionState } from "react";
import { AuthForm, SubmitButton } from "@/shared/ui/auth-form/auth-form";
import { LeavingFor } from "@/shared/ui/leaving-for/leaving-for";
import { TextSubmit } from "@/shared/ui/text-link/text-link";
import { consentAction, switchAccountAction } from "../../actions/consent";
import type { ConsentProblem, ConsentState } from "../../types";
import "./consent-form.scss";

function Problem({ problem, restartUrl }: { problem: ConsentProblem; restartUrl?: string }) {
  if (problem.kind === "message") {
    return (
      <Alert intent="danger">
        <AlertDescription>{problem.text}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert intent="warning">
      <AlertTitle>This request has expired</AlertTitle>
      <AlertDescription>
        It's good for 10 minutes. Start again to get a fresh one from the app.
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

type ConsentFormProps = {
  email: string;
  oidcQuery: string;
  restartUrl?: string | undefined;
};

const INITIAL: ConsentState = { status: "deciding", attempt: 0 };

/**
 * Allow or Deny, answered by the server action: Better Auth checks the signed request again,
 * records the consent and says where the app gets its answer, and the browser goes there.
 */
export function ConsentForm({ email, oidcQuery, restartUrl }: ConsentFormProps) {
  const [state, action, pending] = useActionState(consentAction, INITIAL);

  if (state.status === "leaving") return <LeavingFor url={state.url} />;

  return (
    <div className="consent-form">
      <AuthForm key={state.attempt} action={action}>
        <input type="hidden" name="oidcQuery" value={oidcQuery} />
        {state.problem ? (
          <Problem problem={state.problem} {...(restartUrl ? { restartUrl } : {})} />
        ) : null}
        <div className="consent-form__buttons">
          <SubmitButton
            pending={pending}
            pendingLabel="Sending…"
            name="decision"
            value="deny"
            intent="secondary"
          >
            Deny
          </SubmitButton>
          <SubmitButton pending={pending} pendingLabel="Sending…" name="decision" value="allow">
            Allow
          </SubmitButton>
        </div>
      </AuthForm>
      {/* A form of its own: it signs out, then the app's request starts again through sign-in. */}
      <Form action={switchAccountAction} className="consent-form__account">
        <input type="hidden" name="oidcQuery" value={oidcQuery} />
        Signed in as <strong>{email}</strong>. <TextSubmit>Use another account</TextSubmit>
      </Form>
    </div>
  );
}
