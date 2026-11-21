import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import type { ReactNode } from "react";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { listSessionsForAccount } from "../server/sessions";
import { ChangePasswordForm } from "./change-password-form/change-password-form";
import { SignOutEverywhereButton } from "./session-list/session-actions";
import { SessionList } from "./session-list/session-list";
import "./account-security-screen.scss";

type AccountSecurityScreenProps = {
  email: string;
  /** The two-factor card, from the two-factor feature: the page puts it here. */
  twoFactor: ReactNode;
};

/** /account/security: password, two-factor and where the account is signed in. */
export async function AccountSecurityScreen({ email, twoFactor }: AccountSecurityScreenProps) {
  const sessions = await listSessionsForAccount();
  return (
    <div className="account-security-screen">
      <PageHeader title="Security" description={`Signed in as ${email}.`} />

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>Password</h2>
          </CardTitle>
          <CardDescription>Changing it signs you out on every other device.</CardDescription>
        </CardHeader>
        <CardContent className="account-security-screen__password">
          <ChangePasswordForm />
        </CardContent>
      </Card>

      {twoFactor}

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id="sessions-heading">Where you're signed in</h2>
          </CardTitle>
          <CardDescription>
            Sign out a device you don't recognise, then change your password.
          </CardDescription>
          <CardAction>
            <SignOutEverywhereButton />
          </CardAction>
        </CardHeader>
        <CardContent>
          <SessionList sessions={sessions} labelledBy="sessions-heading" />
        </CardContent>
      </Card>
    </div>
  );
}
