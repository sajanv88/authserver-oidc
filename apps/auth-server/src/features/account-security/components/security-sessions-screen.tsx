import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { SECURITY_PAGES } from "@/shared/auth/account-pages";
import { ListPagination } from "@/shared/ui/list-pagination/list-pagination";
import { PageNumberSchema } from "@/shared/validation/paging";
import { listSessionsForAccount } from "../server/sessions";
import type { AccountUser } from "../types";
import { SecurityLayout } from "./security-layout/security-layout";
import { SignOutEverywhereButton } from "./session-list/session-actions";
import { SessionList } from "./session-list/session-list";

/** The address of a page of the session list; page 1 is the list's own. */
function sessionsPageHref(page: number) {
  return page > 1 ? (`${SECURITY_PAGES.sessions}?page=${page}` as const) : SECURITY_PAGES.sessions;
}

/**
 * /account/security/sessions: where the account is signed in, ten to a page, this device
 * first. Checks the session itself. `page` is the list's `?page=`, as the URL has it.
 */
export async function SecuritySessionsScreen({
  user,
  page,
}: {
  user: AccountUser;
  page: string | string[] | undefined;
}) {
  const requested = v.parse(PageNumberSchema, page);
  const { sessions, ...pages } = await listSessionsForAccount(requested);
  // Past the end (the last session on the last page was signed out, or an old link).
  if (pages.page !== requested) redirect(sessionsPageHref(pages.page));
  return (
    <SecurityLayout user={user} active="sessions">
      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2 id="sessions-heading">Where you're signed in</h2>
          </CardTitle>
          <CardDescription>
            Sign out a device you don't recognise, then change your password.
          </CardDescription>
          <CardAction>
            <SignOutEverywhereButton />
          </CardAction>
        </CardHeader>
        <CardContent>
          <SessionList sessions={sessions} labelledBy="sessions-heading" />
          {pages.pageCount > 1 ? (
            <ListPagination {...pages} things="sessions" hrefFor={sessionsPageHref} />
          ) : null}
        </CardContent>
      </Card>
    </SecurityLayout>
  );
}
