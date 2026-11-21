import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { MagicLinkContext } from "../types";
import { MagicLinkForm } from "./magic-link-form/magic-link-form";
import "./magic-link-screen.scss";

/** /magic-link: ask for a link, after explaining one that didn't work if that's how we got here. */
export function MagicLinkScreen(context: MagicLinkContext) {
  return (
    <AuthCard
      title="Sign in with a link"
      description="We'll email you a link that signs you in, no password needed."
      footer={
        <p>
          Rather use your password? <TextLink href={context.loginHref}>Sign in</TextLink>
        </p>
      }
    >
      <div className="magic-link-screen">
        {context.linkFailed ? (
          <Alert intent="warning">
            <AlertTitle>That link didn't work</AlertTitle>
            <AlertDescription>
              Each link works once, for 5 minutes. Ask for a new one below.
            </AlertDescription>
          </Alert>
        ) : null}
        <MagicLinkForm
          callbackURL={context.callbackURL}
          errorCallbackURL={context.errorCallbackURL}
        />
      </div>
    </AuthCard>
  );
}
