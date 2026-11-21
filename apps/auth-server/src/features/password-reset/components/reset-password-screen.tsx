import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { ResetPasswordContext } from "../types";
import { ResetPasswordForm } from "./reset-password-form/reset-password-form";

/** /reset-password: the form for a good link, or why the link didn't work. */
export function ResetPasswordScreen(context: ResetPasswordContext) {
  if (context.status === "invalid") {
    return (
      <AuthCard
        title="That link didn't work"
        footer={
          <p>
            <TextLink href={context.forgotPasswordHref}>Get a new link</TextLink>
          </p>
        }
      >
        <Alert intent="warning">
          <AlertTitle>The link has expired or was already used</AlertTitle>
          <AlertDescription>
            Each link works once, for 15 minutes. Ask for a new one and use the latest email.
          </AlertDescription>
        </Alert>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <ResetPasswordForm
        token={context.token}
        next={context.next}
        forgotPasswordHref={context.forgotPasswordHref}
      />
    </AuthCard>
  );
}
