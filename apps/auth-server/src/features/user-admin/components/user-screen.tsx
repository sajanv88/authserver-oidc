import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import Link from "next/link";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { userProfileForAdmin } from "../server/pages";
import type { UserProfile } from "../types";
import { momentFormat } from "./user-badges";
import { UserBreadcrumb, UserHeader } from "./user-header/user-header";
import { UserHistoryCard } from "./user-history";
import { UserDangerZone, UserManage } from "./user-manage/user-manage";
import { UserSessions } from "./user-sessions/user-sessions";
import "./user-screen.scss";

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
        {user.disabledReason ? `Reason: ${user.disabledReason}` : "No reason was given."} They can't
        sign in, by any method, until then.
      </AlertDescription>
    </Alert>
  );
}

function SelfNotice() {
  return (
    <Alert>
      <AlertTitle>This is your account</AlertTitle>
      <AlertDescription>
        Another admin manages it here. Your own password, two-factor and sessions are under My
        profile.
      </AlertDescription>
      <AlertActions>
        <Button asChild size="sm" intent="secondary">
          <Link href={SECURITY_PAGES.password}>Go to My profile</Link>
        </Button>
      </AlertActions>
    </Alert>
  );
}

/**
 * /admin/users/[id]. Checks the admin session itself. The header comes first; the sessions and
 * the history load on their own, each with a placeholder and its own error boundary, so a slow
 * or failing section never holds up the rest. `sessionsPage` is the sessions' page number.
 */
export async function UserScreen({ id, sessionsPage }: { id: string; sessionsPage: number }) {
  const user = await userProfileForAdmin(id);
  const name = user.name.trim() || user.email;

  return (
    <div className="user-screen">
      <UserBreadcrumb current={name} />
      <UserHeader user={user} name={name} />
      {user.isSelf ? <SelfNotice /> : <DisabledNotice user={user} />}

      <div className="user-screen__columns">
        <div className="user-screen__main">
          <UserSessions user={user} name={name} page={sessionsPage} />
          {user.isSelf ? null : (
            <>
              <UserManage user={user} name={name} />
              <UserDangerZone user={user} name={name} />
            </>
          )}
        </div>
        <UserHistoryCard userId={user.id} name={name} />
      </div>
    </div>
  );
}
