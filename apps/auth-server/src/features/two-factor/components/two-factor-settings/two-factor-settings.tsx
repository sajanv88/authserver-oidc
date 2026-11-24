import {
  Badge,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { env } from "@/shared/config/env";
import { BackupCodesDialog } from "./backup-codes-dialog";
import { DisableDialog } from "./disable-dialog";
import { EnableDialog } from "./enable-dialog";

/**
 * The account's two-factor settings. A server component: whether it's on comes from the
 * session; only the dialogs run on the client.
 */
export function TwoFactorSettings({ enabled }: { enabled: boolean }) {
  const { appName } = env();
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Two-factor authentication</h2>
        </CardTitle>
        <CardDescription>
          A code from an authenticator app, asked for after your password.
        </CardDescription>
        <CardAction>
          <Badge intent={enabled ? "success" : "neutral"}>{enabled ? "On" : "Off"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {enabled
          ? "Keep your backup codes somewhere safe: each signs you in once if you lose your phone."
          : "Turn it on so a stolen password isn't enough to get into your account."}
      </CardContent>
      {/* Turning two-factor on or off gives the session a new cookie, so the page re-renders
          with `enabled` flipped while that dialog is still open (showing the backup codes, or
          about to say it's off). Both keep their place in the tree, so React keeps them and
          their state; each shows its button only when it applies. */}
      <CardFooter>
        <EnableDialog available={!enabled} appName={appName} />
        {enabled ? <BackupCodesDialog appName={appName} /> : null}
        <DisableDialog available={enabled} />
      </CardFooter>
    </Card>
  );
}
