import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import * as v from "valibot";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { ListPagination } from "@/shared/ui/list-pagination/list-pagination";
import { RowsSkeleton } from "@/shared/ui/list-skeleton/list-skeleton";
import { SectionBoundary } from "@/shared/ui/section-boundary/section-boundary";
import { SessionList } from "@/shared/ui/session-list/session-list";
import { PageNumberSchema } from "@/shared/validation/paging";
import { listSessionsForAccount } from "../server/sessions";
import type { AccountUser } from "../types";
import { SecurityLayout } from "./security-layout/security-layout";
import { RevokeSessionButton, SignOutEverywhereButton } from "./session-list/session-actions";

const HEADING_ID = "sessions-heading";

/** The address of a page of the session list; page 1 is the list's own. */
function sessionsPageHref(page: number) {
  return page > 1 ? (`${SECURITY_PAGES.sessions}?page=${page}` as const) : SECURITY_PAGES.sessions;
}

/** The list itself, which waits for the database: the page around it doesn't. */
async function Sessions({ page }: { page: number }) {
  const { sessions, ...pages } = await listSessionsForAccount(page);
  // Past the end (the last session on the last page was signed out, or an old link).
  if (pages.page !== page) redirect(sessionsPageHref(pages.page));
  return (
    <>
      <SessionList
        sessions={sessions}
        labelledBy={HEADING_ID}
        actionFor={(session, titleId) =>
          session.current ? null : (
            <RevokeSessionButton
              sessionId={session.id}
              label={session.device.label}
              labelledBy={titleId}
            />
          )
        }
      />
      {pages.pageCount > 1 ? (
        <ListPagination {...pages} things="sessions" hrefFor={sessionsPageHref} />
      ) : null}
    </>
  );
}

/**
 * /account/security/sessions: where the account is signed in, ten to a page, this device
 * first. Checks the session itself. `page` is the list's `?page=`, as the URL has it. The
 * profile and the tabs show at once; the list streams in behind a skeleton, with its own error
 * boundary.
 */
export function SecuritySessionsScreen({
  user,
  page,
}: {
  user: AccountUser;
  page: string | string[] | undefined;
}) {
  const requested = v.parse(PageNumberSchema, page);
  return (
    <SecurityLayout user={user} active="sessions">
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id={HEADING_ID}>Where you're signed in</h2>
          </CardTitle>
          <CardDescription>
            Sign out a device you don't recognise, then change your password.
          </CardDescription>
          <CardAction>
            <SignOutEverywhereButton />
          </CardAction>
        </CardHeader>
        <CardContent>
          <SectionBoundary what="your sessions">
            {/* Keyed by page, so moving between pages shows the placeholder again. */}
            <Suspense
              key={requested}
              fallback={<RowsSkeleton count={3} label="Loading your sessions" />}
            >
              <Sessions page={requested} />
            </Suspense>
          </SectionBoundary>
        </CardContent>
      </Card>
    </SecurityLayout>
  );
}
