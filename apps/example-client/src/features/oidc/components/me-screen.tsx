import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { redirect } from "next/navigation";
import { getAppSession } from "../server/routes";
import { userInfoFor } from "../server/userinfo";
import { ClaimsTable } from "./claims-table";
import { SignOutForm } from "./sign-out-form";
import "./me-screen.scss";

const when = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

export async function MeScreen({ refreshed }: { refreshed: boolean }) {
  const session = await getAppSession();
  if (!session) redirect("/");

  const expired = session.accessTokenExpiresAt * 1000 <= Date.now();
  const userInfo = expired ? undefined : await userInfoFor(session.accessToken);

  return (
    <div className="me-screen">
      {refreshed ? (
        <Alert intent="success" role="status">
          <AlertTitle>Tokens refreshed</AlertTitle>
          <AlertDescription>
            The refresh token was rotated: the old one no longer works.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>Tokens</h2>
          </CardTitle>
          <CardDescription>
            Kept in an encrypted, httpOnly cookie of this app. They never reach the browser's
            JavaScript.
          </CardDescription>
        </CardHeader>
        <CardContent className="me-screen__facts">
          <span>Access token</span>
          <span>
            <Badge intent={expired ? "warning" : "success"}>{expired ? "Expired" : "Valid"}</Badge>{" "}
            until{" "}
            <time dateTime={new Date(session.accessTokenExpiresAt * 1000).toISOString()}>
              {when.format(new Date(session.accessTokenExpiresAt * 1000))} UTC
            </time>
          </span>
          <span>Refresh token</span>
          <span>{session.refreshToken ? "Yes (offline_access)" : "None"}</span>
        </CardContent>
        <CardFooter className="me-screen__actions">
          {session.refreshToken ? (
            <form method="post" action="/oidc/refresh">
              <Button type="submit">Refresh the tokens</Button>
            </form>
          ) : null}
          <SignOutForm />
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>ID token</h2>
          </CardTitle>
          <CardDescription>
            Verified with the auth server's keys: issuer, audience, expiry and the nonce this
            sign-in sent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClaimsTable claims={session.claims} caption="ID token claims" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>/oauth2/userinfo</h2>
          </CardTitle>
          <CardDescription>
            Asked for now, with the access token. Email and profile claims come from here, not from
            the ID token.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userInfo?.ok ? (
            <ClaimsTable claims={userInfo.claims} caption="Userinfo claims" />
          ) : (
            <Alert intent="warning">
              <AlertDescription>
                {expired
                  ? "The access token has expired. Refresh the tokens to ask again."
                  : `The auth server answered ${userInfo?.status ?? "nothing"}.`}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
