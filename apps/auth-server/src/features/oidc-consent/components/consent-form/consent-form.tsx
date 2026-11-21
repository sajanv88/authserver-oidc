"use client";

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
  Button,
  Spinner,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { type AuthClientError, authErrorMessage } from "@/shared/auth/auth-errors";
import { TextButton } from "@/shared/ui/text-link/text-link";
import { parseForm } from "@/shared/validation/field-errors";
import { ConsentDecisionSchema } from "../../schemas/consent";
import type { ConsentProblem, ConsentState } from "../../types";
import "./consent-form.scss";

/** What a refused answer means for the person deciding. */
function problemFor(error: AuthClientError & { error?: unknown }): ConsentProblem {
  // The signed request outlived its 10 minutes, or the session ended meanwhile.
  if (error.error === "invalid_signature" || error.status === 401) return { kind: "expired" };
  return {
    kind: "message",
    text: authErrorMessage(error, "Your answer didn't go through. Try again in a moment."),
  };
}

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
  restartUrl?: string | undefined;
};

/**
 * Allow or Deny. The browser auth client sends the signed request on this page's URL along
 * (`oauth_query`); Better Auth checks it again, records the consent, and answers with the way
 * back to the app (a code, or `error=access_denied`), which its redirect plugin follows.
 */
export function ConsentForm({ email, restartUrl }: ConsentFormProps) {
  const router = useRouter();
  const [state, setState] = useState<ConsentState>({ status: "deciding" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const parsed = parseForm(
      ConsentDecisionSchema,
      Object.fromEntries(new FormData(event.currentTarget, submitter)),
    );
    if (!parsed.ok) return;

    const { decision } = parsed.value;
    setState({ status: "sending", decision });
    const { data, error } = await authClient.oauth2.consent({ accept: decision === "allow" });
    if (error) {
      setState({ status: "deciding", problem: problemFor(error) });
      return;
    }
    setState({ status: "leaving" });
    // The redirect plugin follows `url`; this is in case it didn't.
    if (data?.url) window.location.assign(data.url);
  }

  async function switchAccount() {
    const { error } = await authClient.signOut();
    if (error) {
      toast("Couldn't sign out", { intent: "danger", description: "Try again in a moment." });
      return;
    }
    // Without a session the page starts the request again, through sign-in.
    router.refresh();
  }

  const busy = state.status !== "deciding";
  const sending = state.status === "sending" ? state.decision : undefined;

  return (
    <form className="consent-form" onSubmit={submit}>
      {state.status === "deciding" && state.problem ? (
        <Problem problem={state.problem} {...(restartUrl ? { restartUrl } : {})} />
      ) : null}
      <div className="consent-form__buttons">
        <Button type="submit" name="decision" value="deny" intent="secondary" disabled={busy}>
          {sending === "deny" ? <Spinner size="sm" label="" /> : null}
          Deny
        </Button>
        <Button type="submit" name="decision" value="allow" disabled={busy}>
          {sending === "allow" ? <Spinner size="sm" label="" /> : null}
          Allow
        </Button>
      </div>
      <p className="consent-form__account">
        Signed in as <strong>{email}</strong>.{" "}
        <TextButton onClick={switchAccount}>Use another account</TextButton>
      </p>
    </form>
  );
}
