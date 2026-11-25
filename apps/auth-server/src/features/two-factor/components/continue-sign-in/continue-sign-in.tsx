"use client";

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import Form from "next/form";
import { useActionState } from "react";
import { LeavingFor } from "@/shared/ui/leaving-for/leaving-for";
import { continueSignInAction } from "../../actions/continue";
import type { ContinueSignInState } from "../../types";

const INITIAL: ContinueSignInState = { status: "ready", attempt: 0 };

/**
 * Back to the app whose sign-in sent someone here to set up two-factor, once it's on. A form:
 * it works without JavaScript, and the server decides where it goes.
 */
export function ContinueSignIn({ oidcQuery }: { oidcQuery: string }) {
  const [state, formAction, pending] = useActionState(continueSignInAction, INITIAL);
  if (state.status === "leaving") return <LeavingFor url={state.url} />;
  return (
    <Alert intent={state.notYet ? "warning" : "success"} role="status">
      <AlertTitle>{state.notYet ? "Two-factor isn't on yet" : "Two-factor is on"}</AlertTitle>
      <AlertDescription>
        {state.notYet
          ? "Finish setting it up, then continue."
          : "You can go on signing in to the app that sent you here."}
      </AlertDescription>
      <AlertActions>
        <Form action={formAction}>
          <input type="hidden" name="oidcQuery" value={oidcQuery} />
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Continuing…" : "Continue to the app"}
          </Button>
        </Form>
      </AlertActions>
    </Alert>
  );
}
