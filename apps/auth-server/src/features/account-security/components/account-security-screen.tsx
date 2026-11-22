import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import type { ReactNode } from "react";
import { authPageHref } from "@/shared/auth/auth-pages";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { listSessionsForAccount } from "../server/sessions";
import { signInMethodsForAccount } from "../server/sign-in-methods";
import { ChangePasswordForm } from "./change-password-form/change-password-form";
import { SignOutEverywhereButton } from "./session-list/session-actions";
import { SessionList } from "./session-list/session-list";
import "./account-security-screen.scss";

type AccountSecurityScreenProps = {
  email: string;
  /** The two-factor card, from the two-factor feature: the page puts it here. */
  twoFactor: ReactNode;
};

export async function AccountSecurityScreen({ email, twoFactor }: AccountSecurityScreenProps) {
  const [sessions, methods] = await Promise.all([
    listSessionsForAccount(),
    signInMethodsForAccount(),
  ]);
  const others = new Intl.ListFormat("en", { type: "conjunction" }).format(methods.providers);
  return (
    <div className="account-security-screen">
      <PageHeader title="Security" description={`Signed in as ${email}.`} />

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>Password</h2>
          </CardTitle>
          <CardDescription>
            {methods.hasPassword
              ? "Changing it signs you out on every other device."
              : `You sign in with ${others}. Add a password to sign in with your email too, and to turn on two-factor authentication.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="account-security-screen__password">
          {methods.hasPassword ? (
            <ChangePasswordForm />
          ) : (
            // A reset link creates the password: it proves the email is theirs first.
            <Button asChild intent="secondary">
              <a href={authPageHref("forgotPassword")}>Set a password</a>
            </Button>
          )}
        </CardContent>
      </Card>

      {methods.providers.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>Linked accounts</h2>
            </CardTitle>
            <CardDescription>
              Linked the first time you signed in with them, to the same email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="account-security-screen__providers">
              {methods.providers.map((name) => (
                <li key={name}>
                  <Badge variant="outline">{name}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

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
