import { ArrowLeftIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import Link from "next/link";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { TextLink } from "@/shared/ui/text-link/text-link";
import { UserAvatar } from "@/shared/ui/user-avatar/user-avatar";
import {
  changeRoleAction,
  enableUserAction,
  requireTwoFactorAction,
  resetTwoFactorAction,
  signOutUserAction,
} from "../actions/users";
import { USERS_PATH } from "../paths";
import { userProfileForAdmin } from "../server/pages";
import type { UserProfile } from "../types";
import { ConfirmAction } from "./confirm-action/confirm-action";
import { DeleteDialog } from "./delete-dialog/delete-dialog";
import { DisableDialog } from "./disable-dialog/disable-dialog";
import { dayFormat, momentFormat, StatusBadge, TwoFactorBadge } from "./user-badges";
import { UserHistory } from "./user-history";
import "./user-screen.scss";

function sessionsText(count: number): string {
  if (count === 0) return "Not signed in anywhere right now.";
  return count === 1 ? "Signed in on 1 device." : `Signed in on ${count} devices.`;
}

function UserHeader({ user, name }: { user: UserProfile; name: string }) {
  const facts = [
    { label: "Joined", value: dayFormat.format(new Date(user.createdAt)) },
    {
      label: "Last active",
      value: user.lastActiveAt ? dayFormat.format(new Date(user.lastActiveAt)) : "Not signed in",
    },
    { label: "Two-factor", value: <TwoFactorBadge state={user.twoFactor} /> },
    { label: "Status", value: <StatusBadge status={user.status} /> },
  ];
  return (
    <header className="user-screen__header">
      <div className="user-screen__who">
        <UserAvatar user={user} size="lg" />
        <div className="user-screen__about">
          <div className="user-screen__heading">
            <h1 className="user-screen__title">{name}</h1>
            {user.role === "admin" ? <Badge variant="outline">Admin</Badge> : null}
          </div>
          <p className="user-screen__email">{user.email}</p>
        </div>
      </div>
      <dl className="user-screen__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="user-screen__fact">
            <dt className="user-screen__label">{fact.label}</dt>
            <dd className="user-screen__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

function DisabledNotice({ user }: { user: UserProfile }) {
  if (user.status !== "disabled") return null;
  return (
    <Alert intent="danger">
      <AlertTitle>
        {user.disabledUntil
          ? `Disabled until ${momentFormat.format(new Date(user.disabledUntil))} UTC`
          : "Disabled until an admin enables it"}
      </AlertTitle>
      <AlertDescription>
        {user.disabledReason ? `Reason: ${user.disabledReason}` : "No reason was given."}
      </AlertDescription>
    </Alert>
  );
}

/** /admin/users/[id]. Checks the admin session itself. */
export async function UserScreen({ id }: { id: string }) {
  const user = await userProfileForAdmin(id);
  const name = user.name.trim() || user.email;
  const twoFactorWords = user.twoFactorRequiredAsAdmin
    ? "Every admin must have it on: this server's TWO_FACTOR_REQUIRED_FOR_ADMINS setting."
    : user.twoFactorRequired
      ? "Required: until it's on, they're sent to set it up, and no app signs them in."
      : "Not required. Require it to send them to set it up at their next request.";

  return (
    <div className="user-screen">
      <Link className="user-screen__back" href={USERS_PATH}>
        <ArrowLeftIcon size={16} aria-hidden="true" />
        Users
      </Link>
      <UserHeader user={user} name={name} />
      <DisabledNotice user={user} />

      {user.isSelf ? (
        <Alert>
          <AlertTitle>This is your account</AlertTitle>
          <AlertDescription>
            Another admin manages it here. Change your own password, two-factor and sessions under{" "}
            <TextLink href={SECURITY_PAGES.password}>My profile</TextLink>.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="user-screen__cards">
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Access</h2>
              </CardTitle>
              <CardDescription>{sessionsText(user.activeSessions)}</CardDescription>
            </CardHeader>
            <CardContent className="user-screen__actions">
              {user.status === "disabled" ? (
                <ConfirmAction
                  action={enableUserAction.bind(null, user.id)}
                  label="Enable"
                  intent="primary"
                  title={`Enable ${name}?`}
                  description="They can sign in again, and get an email saying so."
                  confirm="Enable account"
                  working="Enabling…"
                  done={`${name} is enabled`}
                />
              ) : null}
              {/* Always here, in the same place: see DisableDialog. */}
              <DisableDialog userId={user.id} name={name} available={user.status !== "disabled"} />
              <ConfirmAction
                action={signOutUserAction.bind(null, user.id)}
                label="Sign out everywhere"
                title={`Sign ${name} out everywhere?`}
                description="Every session ends now, and apps lose the access they were given, offline access included. They can sign in again."
                confirm="Sign out everywhere"
                working="Signing out…"
                done={`${name} is signed out everywhere`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Two-factor authentication</h2>
              </CardTitle>
              <CardDescription>{twoFactorWords}</CardDescription>
            </CardHeader>
            <CardContent className="user-screen__actions">
              {user.twoFactorRequired ? (
                <ConfirmAction
                  key="unrequire"
                  action={requireTwoFactorAction.bind(null, user.id, false)}
                  label="Stop requiring it"
                  title="Stop requiring two-factor?"
                  description={
                    user.twoFactorRequiredAsAdmin
                      ? "It stays required while they're an admin, by this server's setting."
                      : "They can turn it off themselves. If they haven't set it up, they're no longer sent to."
                  }
                  confirm="Stop requiring it"
                  working="Saving…"
                  done="Two-factor is no longer required"
                />
              ) : (
                <ConfirmAction
                  key="require"
                  action={requireTwoFactorAction.bind(null, user.id, true)}
                  label="Require two-factor"
                  intent="primary"
                  title={`Require two-factor of ${name}?`}
                  description="If it isn't on, their next request sends them to set it up, and no app signs them in until it is. They can't turn it off."
                  confirm="Require it"
                  working="Saving…"
                  done="Two-factor is required"
                />
              )}
              {user.twoFactor === "on" ? (
                <ConfirmAction
                  action={resetTwoFactorAction.bind(null, user.id)}
                  label="Reset two-factor"
                  intent="danger"
                  title={`Reset two-factor for ${name}?`}
                  description="For a lost phone: their authenticator app and backup codes stop working, and they get an email saying so. Only do it once you know it's them asking."
                  confirm="Reset two-factor"
                  working="Resetting…"
                  done="Two-factor was reset"
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h2>Role</h2>
              </CardTitle>
              <CardDescription>
                {user.role === "admin"
                  ? "An admin: manages users and OIDC clients."
                  : "A user: signs in to apps, and manages their own account."}
              </CardDescription>
            </CardHeader>
            <CardContent className="user-screen__actions">
              {user.role === "admin" ? (
                <ConfirmAction
                  key="demote"
                  action={changeRoleAction.bind(null, user.id, "user")}
                  label="Remove admin"
                  title={`Make ${name} a user?`}
                  description="They can no longer manage users or OIDC clients."
                  confirm="Remove admin"
                  working="Saving…"
                  done={`${name} is a user`}
                />
              ) : (
                <ConfirmAction
                  key="promote"
                  action={changeRoleAction.bind(null, user.id, "admin")}
                  label="Make admin"
                  title={`Make ${name} an admin?`}
                  description="They can manage every user and OIDC client here, other admins included."
                  confirm="Make admin"
                  working="Saving…"
                  done={`${name} is an admin`}
                />
              )}
            </CardContent>
          </Card>

          <Card className="user-screen__danger">
            <CardHeader>
              <CardTitle asChild>
                <h2>Delete the account</h2>
              </CardTitle>
              <CardDescription>
                Removes it for good, at their request (GDPR) or once it's no longer needed.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DeleteDialog userId={user.id} email={user.email} name={name} />
            </CardContent>
          </Card>
        </div>
      )}

      <section className="user-screen__history" aria-labelledby="user-history">
        <h2 id="user-history" className="user-screen__section-title">
          History
        </h2>
        {user.history.length > 0 ? (
          <UserHistory entries={user.history} name={name} />
        ) : (
          <p className="user-screen__none">No admin has changed this account.</p>
        )}
      </section>
    </div>
  );
}
