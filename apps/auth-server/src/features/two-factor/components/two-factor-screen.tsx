import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import { AuthCard } from "@/shared/ui/auth-card/auth-card";
import { TextLink } from "@/shared/ui/text-link/text-link";
import type { TwoFactorPageContext } from "../types";
import { VerifyForm } from "./verify-form/verify-form";

/** /two-factor: the second step of a password sign-in, by app code or backup code. */
export function TwoFactorScreen({ oidcQuery, returnTo, loginHref }: TwoFactorPageContext) {
  return (
    <AuthCard
      title="Two-factor authentication"
      description="Your password was right. Now confirm it's you."
      footer={
        <p>
          Not you, or a different account? <TextLink href={loginHref}>Sign in again</TextLink>
        </p>
      }
    >
      <Tabs defaultValue="totp">
        <TabsList aria-label="How to confirm">
          <TabsTrigger value="totp">Authenticator app</TabsTrigger>
          <TabsTrigger value="backup">Backup code</TabsTrigger>
        </TabsList>
        <TabsContent value="totp">
          <VerifyForm
            method="totp"
            oidcQuery={oidcQuery}
            returnTo={returnTo}
            loginHref={loginHref}
          />
        </TabsContent>
        <TabsContent value="backup">
          <VerifyForm
            method="backup"
            oidcQuery={oidcQuery}
            returnTo={returnTo}
            loginHref={loginHref}
          />
        </TabsContent>
      </Tabs>
    </AuthCard>
  );
}
