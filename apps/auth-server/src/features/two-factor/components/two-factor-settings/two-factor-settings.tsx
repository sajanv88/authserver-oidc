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
export function TwoFactorSettings({
  enabled,
  required = false,
}: {
  enabled: boolean;
  /** An admin, or the setting for admins, requires it: it can't be turned off. */
  required?: boolean | undefined;
}) {
  const { appName } = env();
  const explanation = required
    ? enabled
      ? "It's required for your account, so it stays on. Keep your backup codes somewhere safe: each signs you in once if you lose your phone."
      : "Your account requires it. Set it up to go on: until it's on, this is the only page you can use, and apps can't sign you in."
    : enabled
      ? "Keep your backup codes somewhere safe: each signs you in once if you lose your phone."
      : "Turn it on so a stolen password isn't enough to get into your account.";
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
          <Badge intent={enabled ? "success" : required ? "warning" : "neutral"}>
            {enabled ? "On" : required ? "Required" : "Off"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>{explanation}</CardContent>
      {/* Turning two-factor on or off gives the session a new cookie, so the page re-renders
          with `enabled` flipped while that dialog is still open (showing the backup codes, or
          about to say it's off). Both keep their place in the tree, so React keeps them and
          their state; each shows its button only when it applies. */}
      <CardFooter>
        <EnableDialog available={!enabled} appName={appName} />
        {enabled ? <BackupCodesDialog appName={appName} /> : null}
        <DisableDialog available={enabled && !required} />
      </CardFooter>
    </Card>
  );
}
