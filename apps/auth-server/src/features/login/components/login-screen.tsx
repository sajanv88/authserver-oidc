import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/config/app";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { LoginContext } from "../types";
import { LoginForm } from "./login-form/login-form";

/** Its links keep the OIDC query (or returnTo) the page was opened with. */
export function LoginScreen({
  social,
  ...context
}: LoginContext & {
  /** The sign-in-with-a-provider buttons, from their feature: the page puts them here. */
  social?: ReactNode;
}) {
  return (
    <AuthCard
      title="Sign in"
      description={`Use your ${APP_NAME} account.`}
      footer={
        <>
          <p>
            <TextLink href={context.magicLinkHref}>Email me a sign-in link instead</TextLink>
          </p>
          <p>
            New here? <TextLink href={context.signUpHref}>Create an account</TextLink>
          </p>
        </>
      }
    >
      {social}
      <LoginForm
        oidcQuery={context.oidcQuery}
        returnTo={context.returnTo}
        restartUrl={context.restartUrl}
        forgotPasswordHref={context.forgotPasswordHref}
      />
    </AuthCard>
  );
}
