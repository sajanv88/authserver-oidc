import { GridIcon } from "@nuvui/icons";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { ListPagination } from "@/shared/ui/list-pagination/list-pagination";
import { TableSkeleton } from "@/shared/ui/list-skeleton/list-skeleton";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { PageNumberSchema } from "@/shared/validation/paging";
import { listClientsForAdmin } from "../server/clients";
import { CLIENT_COLUMNS, ClientsTable } from "./clients-table/clients-table";
import { CreateClientDialog } from "./create-client-dialog/create-client-dialog";

/** The address of a page of the client list; page 1 is the list's own. */
function clientsPageHref(page: number) {
  return page > 1 ? (`/admin/clients?page=${page}` as const) : ("/admin/clients" as const);
}

const TITLE = "OIDC clients";
const DESCRIPTION = "Apps that sign people in through this server.";

/** The list while it loads: the route's loading.tsx. */
export function ClientsScreenSkeleton() {
  return (
    <>
      <PageHeader title={TITLE} description={DESCRIPTION} />
      <TableSkeleton columns={CLIENT_COLUMNS} rows={4} label="Loading the clients" />
    </>
  );
}

/** Checks the admin session itself. `page` is the list's `?page=`, as the URL has it. */
export async function ClientsScreen({ page }: { page: string | string[] | undefined }) {
  const requested = v.parse(PageNumberSchema, page);
  const { clients, ...pages } = await listClientsForAdmin(requested);
  // Past the end (the last client on the last page was deleted, or an old link): the last page.
  if (pages.page !== requested) redirect(clientsPageHref(pages.page));
  return (
    <>
      <PageHeader
        title={TITLE}
        description={DESCRIPTION}
        action={clients.length > 0 ? <CreateClientDialog /> : undefined}
      />
      {clients.length > 0 ? (
        <>
          <ClientsTable clients={clients} />
          {pages.pageCount > 1 ? (
            <ListPagination {...pages} things="clients" hrefFor={clientsPageHref} />
          ) : null}
        </>
      ) : (
        <Empty>
          <EmptyMedia>
            <GridIcon />
          </EmptyMedia>
          <EmptyTitle asChild>
            <h2>No clients yet</h2>
          </EmptyTitle>
          <EmptyDescription>
            Add the first app that should sign people in here. You'll get its client ID, and a
            secret if it runs on a server.
          </EmptyDescription>
          <EmptyActions>
            <CreateClientDialog />
          </EmptyActions>
        </Empty>
      )}
    </>
  );
}
