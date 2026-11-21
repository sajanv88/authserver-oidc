import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import { authPageHref } from "@/shared/auth/auth-pages";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { ResendVerificationForm } from "./resend-verification-form/resend-verification-form";
import "./verify-email-failed-screen.scss";

/** Where a confirmation link that didn't work lands: why, and a way to get a new one. */
export function VerifyEmailFailedScreen({ next }: { next: string }) {
  return (
    <AuthCard
      title="That link didn't work"
      footer={
        <p>
          Already confirmed? <TextLink href={authPageHref("login")}>Sign in</TextLink>
        </p>
      }
    >
      <div className="verify-email-failed">
        <Alert intent="warning">
          <AlertTitle>The link has expired or was already used</AlertTitle>
          <AlertDescription>
            Each link works once, for 60 minutes. Enter your email and we'll send a new one.
          </AlertDescription>
        </Alert>
        <ResendVerificationForm next={next} />
      </div>
    </AuthCard>
  );
}
