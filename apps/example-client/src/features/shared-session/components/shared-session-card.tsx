import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { env } from "@/shared/config/env";
import { getSharedSession } from "../server/shared-session";
import "./shared-session-card.scss";

const when = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export async function SharedSessionCard() {
  const session = await getSharedSession();
  const authServer = env().authServerUrl;
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Shared session cookie</h2>
        </CardTitle>
        <CardDescription>
          The auth server sets its session cookie on the parent domain, so it reaches this app too.
          This app forwards only that cookie to the auth server's get-session.
        </CardDescription>
        <CardAction>
          <Badge intent={session.status === "signed-in" ? "success" : "neutral"}>
            {session.status === "signed-in" ? "Signed in" : "Signed out"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {session.status === "signed-in" ? (
          <dl className="shared-session-card__facts">
            <dt className="shared-session-card__term">Name</dt>
            <dd className="shared-session-card__value">{session.name}</dd>
            <dt className="shared-session-card__term">Email</dt>
            <dd className="shared-session-card__value">{session.email}</dd>
            <dt className="shared-session-card__term">Session expires</dt>
            <dd className="shared-session-card__value">
              <time dateTime={session.expiresAt}>
                {when.format(new Date(session.expiresAt))} UTC
              </time>
            </dd>
          </dl>
        ) : session.status === "signed-out" ? (
          <p className="shared-session-card__text">
            No session on the auth server in this browser. Sign in there, then reload this page.
          </p>
        ) : (
          <Alert intent="warning">
            <AlertDescription>The auth server didn't answer. Is it running?</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button asChild intent="secondary">
          {/* Another origin: a plain link. */}
          <a
            href={
              session.status === "signed-in"
                ? `${authServer}/account/security`
                : `${authServer}/login`
            }
          >
            {session.status === "signed-in" ? "Open your account" : "Sign in on the auth server"}
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
}
