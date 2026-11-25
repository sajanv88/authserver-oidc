import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { authPageHref } from "@/shared/auth/auth-pages";
import { signInMethodsForAccount } from "../server/sign-in-methods";
import type { AccountUser } from "../types";
import { ChangePasswordForm } from "./change-password-form/change-password-form";
import { SecurityLayout } from "./security-layout/security-layout";
import "./security-password-screen.scss";

/** /account/security: the password, and the providers linked to the account. */
export async function SecurityPasswordScreen({ user }: { user: AccountUser }) {
  const methods = await signInMethodsForAccount("password");
  const others = new Intl.ListFormat("en", { type: "conjunction" }).format(methods.providers);
  return (
    <SecurityLayout user={user} active="password">
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
        <CardContent>
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
            <ul className="security-password-screen__providers">
              {methods.providers.map((name) => (
                <li key={name}>
                  <Badge variant="outline">{name}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </SecurityLayout>
  );
}
