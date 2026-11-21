import { authPageHref } from "@/shared/auth/auth-pages";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { SignUpContext } from "../types";
import { SignUpForm } from "./sign-up-form/sign-up-form";

/** The sign-up page. The OIDC query, if any, rides along to the login link. */
export function SignUpScreen({ oidcQuery, next }: SignUpContext) {
  return (
    <AuthCard
      title="Create an account"
      description="One account for every app that signs you in here."
      footer={
        <p>
          Already have an account?{" "}
          <TextLink href={authPageHref("login", oidcQuery)}>Sign in</TextLink>
        </p>
      }
    >
      <SignUpForm next={next} />
    </AuthCard>
  );
}
