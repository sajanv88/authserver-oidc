import { Card, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import type { ReactNode } from "react";
import { signInMethodsForAccount } from "../server/sign-in-methods";
import type { AccountUser } from "../types";
import { SecurityLayout } from "./security-layout/security-layout";

type SecurityTwoFactorScreenProps = {
  user: AccountUser;
  /** The two-factor card, from the two-factor feature: the page puts it here. */
  twoFactor: ReactNode;
};

/** /account/security/two-factor: turning it on or off, and new backup codes. */
export async function SecurityTwoFactorScreen({ user, twoFactor }: SecurityTwoFactorScreenProps) {
  const methods = await signInMethodsForAccount();
  return (
    <SecurityLayout user={user} active="twoFactor">
      {methods.hasPassword ? (
        twoFactor
      ) : (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>Two-factor authentication</h2>
            </CardTitle>
            <CardDescription>
              It asks for your password before it turns on, so add a password first.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </SecurityLayout>
  );
}
