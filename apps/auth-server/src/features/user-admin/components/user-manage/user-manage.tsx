import { CrownIcon, PowerIcon, RotateCcwIcon, ShieldCheckIcon, TrashIcon } from "@nuvui/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@nuvui/react";
import type { ReactNode } from "react";
import {
  changeRoleAction,
  enableUserAction,
  requireTwoFactorAction,
  resetTwoFactorAction,
} from "../../actions/users";
import type { UserProfile } from "../../types";
import { ConfirmAction } from "../confirm-action/confirm-action";
import { DeleteDialog } from "../delete-dialog/delete-dialog";
import { DisableDialog } from "../disable-dialog/disable-dialog";
import { momentFormat } from "../user-badges";
import "./user-manage.scss";

type Props = { user: UserProfile; name: string };

/** One setting: an icon, what it is, where it stands, and what can be done about it. */
function Row({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <Item>
      <ItemMedia variant="icon">{icon}</ItemMedia>
      <ItemContent>
        <ItemTitle>{title}</ItemTitle>
        <ItemDescription>{children}</ItemDescription>
      </ItemContent>
      <ItemActions className="user-manage__actions">{action}</ItemActions>
    </Item>
  );
}

function accessText(user: UserProfile): string {
  if (user.status !== "disabled") {
    return "Can sign in.";
  }
  return user.disabledUntil
    ? `Disabled until ${momentFormat.format(new Date(user.disabledUntil))} UTC.`
    : "Disabled until an admin enables it.";
}

function twoFactorText(user: UserProfile): string {
  if (user.twoFactorRequiredAsAdmin) {
    return "Required of every admin by this server.";
  }
  if (user.twoFactorRequired) {
    return user.twoFactor === "on"
      ? "On, and required."
      : "Required, not set up yet: they're sent to set it up.";
  }
  return user.twoFactor === "on"
    ? "On, by their choice."
    : "Off.";
}

/** Access, two-factor and role: what an admin changes most. Not shown on their own account. */
export function UserManage({ user, name }: Props) {
  const disabled = user.status === "disabled";
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 id="user-manage-heading">Manage the account</h2>
        </CardTitle>
        <CardDescription>
          Each change asks first, takes effect at once, and is kept in the history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup variant="outline" aria-labelledby="user-manage-heading">
          <Row
            icon={<PowerIcon size={16} aria-hidden="true" />}
            title="Access"
            action={
              <>
                {disabled ? (
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
                <DisableDialog userId={user.id} name={name} available={!disabled} />
              </>
            }
          >
            {accessText(user)}
          </Row>

          <Row
            icon={<ShieldCheckIcon size={16} aria-hidden="true" />}
            title="Two-factor authentication"
            action={
              user.twoFactorRequired ? (
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
              )
            }
          >
            {twoFactorText(user)}
          </Row>

          {user.twoFactor === "on" ? (
            <Row
              icon={<RotateCcwIcon size={16} aria-hidden="true" />}
              title="Lost their phone?"
              action={
                <ConfirmAction
                  action={resetTwoFactorAction.bind(null, user.id)}
                  label="Reset two-factor"
                  intent="danger"
                  title={`Reset two-factor for ${name}?`}
                  description="Their authenticator app and backup codes stop working, and they get an email saying so. Only do it once you know it's them asking."
                  confirm="Reset two-factor"
                  working="Resetting…"
                  done="Two-factor was reset"
                />
              }
            >
              For a lost phone: they set it up again.
            </Row>
          ) : null}

          <Row
            icon={<CrownIcon size={16} aria-hidden="true" />}
            title="Role"
            action={
              user.role === "admin" ? (
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
              )
            }
          >
            {user.role === "admin"
              ? "An admin."
              : "A user."}
          </Row>
        </ItemGroup>
      </CardContent>
    </Card>
  );
}

/** What can't be undone, apart from the rest, with a red edge and a heading that says so. */
export function UserDangerZone({ user, name }: Props) {
  return (
    <Card className="user-manage__danger">
      <CardHeader>
        <CardTitle asChild>
          <h2 id="user-danger-heading">Danger zone</h2>
        </CardTitle>
        <CardDescription>This can't be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <ItemGroup variant="outline" aria-labelledby="user-danger-heading">
          <Row
            icon={<TrashIcon size={16} aria-hidden="true" />}
            title="Delete the account"
            action={<DeleteDialog userId={user.id} email={user.email} name={name} />}
          >
            Removes it for good. The history stays.
          </Row>
        </ItemGroup>
      </CardContent>
    </Card>
  );
}
