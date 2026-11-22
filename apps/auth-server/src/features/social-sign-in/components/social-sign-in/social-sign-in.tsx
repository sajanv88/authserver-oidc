"use client";

import { Alert, AlertDescription, AlertTitle, Button, Separator } from "@nuvui/react";
import { useActionState } from "react";
import { AuthForm } from "@/shared/ui/auth-form/auth-form";
import { LeavingFor } from "@/shared/ui/leaving-for/leaving-for";
import { socialSignInAction } from "../../actions/social-sign-in";
import type { SocialSignInContext, SocialSignInState } from "../../types";
import { ProviderMark } from "./provider-mark";
import "./social-sign-in.scss";

const INITIAL: SocialSignInState = { status: "idle", attempt: 0 };

/**
 * A button for each configured provider, above the email form, and what went wrong the last
 * time, if Better Auth sent the browser back with an error. One form: the pressed button's
 * name and value say which provider. Works without JavaScript too (a link to the provider).
 */
export function SocialSignIn({ providers, oidcQuery, returnTo, problem }: SocialSignInContext) {
  const [state, action, pending] = useActionState(socialSignInAction, INITIAL);

  if (state.status === "leaving") {
    return (
      <div className="social-sign-in">
        <LeavingFor url={state.url} title={`Taking you to ${state.providerName}`} />
      </div>
    );
  }

  return (
    <div className="social-sign-in">
      {problem && state.status === "idle" ? (
        <Alert intent="warning">
          {problem.title ? <AlertTitle>{problem.title}</AlertTitle> : null}
          <AlertDescription>{problem.text}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === "failed" ? (
        <Alert intent="danger">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {providers.length > 0 ? (
        <>
          <AuthForm action={action}>
            <input type="hidden" name="oidcQuery" value={oidcQuery} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <div className="social-sign-in__buttons">
              {providers.map((provider) => (
                <Button
                  key={provider.id}
                  type="submit"
                  name="provider"
                  value={provider.id}
                  intent="secondary"
                  disabled={pending}
                  className="social-sign-in__button"
                >
                  <ProviderMark id={provider.id} />
                  Continue with {provider.name}
                </Button>
              ))}
            </div>
          </AuthForm>
          <div className="social-sign-in__or">
            <Separator decorative />
            <span>or use your email</span>
            <Separator decorative />
          </div>
        </>
      ) : null}
    </div>
  );
}
