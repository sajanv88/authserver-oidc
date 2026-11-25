import { MonitorIcon } from "@nuvui/icons";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nuvui/react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ListPagination } from "@/shared/ui/list-pagination/list-pagination";
import { SectionBoundary } from "@/shared/ui/section-boundary/section-boundary";
import { SessionList } from "@/shared/ui/session-list/session-list";
import { signOutUserAction } from "../../actions/users";
import { userHref } from "../../paths";
import { userSessionsForAdmin } from "../../server/pages";
import type { UserProfile } from "../../types";
import { ConfirmAction } from "../confirm-action/confirm-action";
import { SessionRowsSkeleton } from "../user-skeletons/user-skeletons";

const HEADING_ID = "user-sessions-heading";

/** The list itself, which waits for the database: the card around it doesn't. */
async function SessionRows({ userId, page }: { userId: string; page: number }) {
  const { sessions, ...pages } = await userSessionsForAdmin(userId, page);
  // Past the end: the last session on the last page ended, or an old link.
  if (pages.page !== page) redirect(userHref(userId, pages.page));
  if (sessions.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <MonitorIcon />
        </EmptyMedia>
        <EmptyTitle asChild>
          <h3>Not signed in anywhere</h3>
        </EmptyTitle>
        <EmptyDescription>
          Their sessions show up here, with the device and when it was last used.
        </EmptyDescription>
      </Empty>
    );
  }
  return (
    <>
      <SessionList sessions={sessions} labelledBy={HEADING_ID} />
      {pages.pageCount > 1 ? (
        <ListPagination {...pages} things="sessions" hrefFor={(n) => userHref(userId, n)} />
      ) : null}
    </>
  );
}

/** Where the person is signed in, ten to a page, most recently used first. */
export function UserSessions({
  user,
  name,
  page,
}: {
  user: UserProfile;
  name: string;
  page: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 id={HEADING_ID}>Where they're signed in</h2>
        </CardTitle>
        <CardDescription>
          {user.isSelf
            ? "Your own sessions. Sign one out from My profile."
            : "Every device with an active session, the most recently used first."}
        </CardDescription>
        {/* Even with no sessions: apps can still hold offline access, which this ends too. */}
        {user.isSelf ? null : (
          <CardAction>
            <ConfirmAction
              action={signOutUserAction.bind(null, user.id)}
              label="Sign out everywhere"
              title={`Sign ${name} out everywhere?`}
              description="Every session ends now, and apps lose the access they were given, offline access included. They can sign in again."
              confirm="Sign out everywhere"
              working="Signing out…"
              done={`${name} is signed out everywhere`}
            />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <SectionBoundary what="the sessions">
          {/* Keyed by page, so moving between pages shows the placeholder again. */}
          <Suspense key={page} fallback={<SessionRowsSkeleton />}>
            <SessionRows userId={user.id} page={page} />
          </Suspense>
        </SectionBoundary>
      </CardContent>
    </Card>
  );
}
