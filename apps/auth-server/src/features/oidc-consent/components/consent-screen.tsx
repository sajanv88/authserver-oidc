import { Alert, AlertActions, AlertDescription, Button } from "@nuvui/react";
import { APP_NAME } from "@/shared/config/app";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import type { ConsentPageContext } from "../types";
import { ConsentForm } from "./consent-form/consent-form";
import { ScopeList } from "./scope-list/scope-list";

/** /consent: an app asks for access to the signed-in account. */
export function ConsentScreen(context: ConsentPageContext) {
  switch (context.status) {
    case "invalid":
      return (
        <AuthCard title="Nothing to approve">
          <Alert intent="warning">
            <AlertDescription>
              This link isn't a request from an app, or the app no longer exists. Go back to the app
              and sign in from there.
            </AlertDescription>
          </Alert>
        </AuthCard>
      );
    case "expired":
      return (
        <AuthCard title="This request has expired">
          <Alert intent="warning">
            <AlertDescription>
              It's good for 10 minutes. Start again to get a fresh one from the app.
            </AlertDescription>
            {context.restartUrl ? (
              <AlertActions>
                <Button asChild intent="secondary" size="sm">
                  {/* A route handler, not a page: a plain link. */}
                  <a href={context.restartUrl}>Start again</a>
                </Button>
              </AlertActions>
            ) : null}
          </Alert>
        </AuthCard>
      );
    case "ready":
      return (
        <AuthCard
          title={`Allow ${context.clientName} to use your account?`}
          description={`${context.clientName} is asking for this from your ${APP_NAME} account:`}
        >
          <ScopeList scopes={context.scopes} />
          <ConsentForm
            email={context.email}
            oidcQuery={context.oidcQuery}
            restartUrl={context.restartUrl}
          />
        </AuthCard>
      );
  }
}
