import { UsersIcon } from "@nuvui/icons";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  VisuallyHidden,
} from "@nuvui/react";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { ListPagination } from "@/shared/ui/list-pagination/list-pagination";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { PageNumberSchema } from "@/shared/validation/paging";
import { usersHref } from "../paths";
import { SearchSchema, StatusFilterSchema } from "../schemas/users";
import { listUsersForAdmin } from "../server/pages";
import { UsersFilter } from "./users-filter/users-filter";
import { UsersTable, UsersTableSkeleton } from "./users-table/users-table";
import "./users-screen.scss";

type Query = string | string[] | undefined;

function UsersHeader() {
  return (
    <PageHeader
      title="Users"
      description="Everyone with an account here. Open someone to disable or enable them, sign them out, require two-factor, change their role or delete them."
    />
  );
}

/** The list while it loads: the route's loading.tsx. */
export function UsersScreenSkeleton() {
  return (
    <div className="users-screen" aria-busy="true">
      <VisuallyHidden role="status">Loading the users</VisuallyHidden>
      <UsersHeader />
      <Skeleton className="users-screen__filter-skeleton" aria-hidden="true" />
      <UsersTableSkeleton rows={5} />
    </div>
  );
}

/** /admin/users. Checks the admin session itself. The query is the URL's, as it has it. */
export async function UsersScreen({ page, q, status }: { page: Query; q: Query; status: Query }) {
  const query = {
    page: v.parse(PageNumberSchema, page),
    search: v.parse(SearchSchema, q),
    status: v.parse(StatusFilterSchema, status),
  };
  const { users, search, ...pages } = await listUsersForAdmin(query);
  // Past the end (an old link, or the last user on the last page was deleted): the last page.
  if (pages.page !== query.page) redirect(usersHref({ ...query, page: pages.page }));
  const filtered = search !== "" || pages.status !== undefined;

  return (
    <div className="users-screen">
      <UsersHeader />
      <UsersFilter search={search} status={pages.status} />
      {users.length > 0 ? (
        <>
          <UsersTable users={users} />
          {pages.pageCount > 1 ? (
            <ListPagination
              {...pages}
              things="users"
              hrefFor={(n) => usersHref({ search, status: pages.status, page: n })}
            />
          ) : null}
        </>
      ) : (
        <Empty>
          <EmptyMedia>
            <UsersIcon />
          </EmptyMedia>
          <EmptyTitle asChild>
            <h2>{filtered ? "No one matches" : "No users yet"}</h2>
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try part of the name or the email address, or another status."
              : "People appear here once they sign up."}
          </EmptyDescription>
        </Empty>
      )}
    </div>
  );
}
