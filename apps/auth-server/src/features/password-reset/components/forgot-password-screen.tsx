import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { ForgotPasswordContext } from "../types";
import { ForgotPasswordForm } from "./forgot-password-form/forgot-password-form";

export function ForgotPasswordScreen({ next, loginHref, retryHref }: ForgotPasswordContext) {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your email and we'll send you a link to choose a new one."
      footer={
        <p>
          Remembered it? <TextLink href={loginHref}>Sign in</TextLink>
        </p>
      }
    >
      <ForgotPasswordForm next={next} retryHref={retryHref} />
    </AuthCard>
  );
}
