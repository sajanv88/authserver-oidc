import { GridIcon } from "@nuvui/icons";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { ClientsPageSchema } from "../schemas/client";
import { listClientsForAdmin } from "../server/clients";
import { ClientsPagination, clientsPageHref } from "./clients-pagination/clients-pagination";
import { ClientsTable } from "./clients-table/clients-table";
import { CreateClientDialog } from "./create-client-dialog/create-client-dialog";

/** Checks the admin session itself. `page` is the list's `?page=`, as the URL has it. */
export async function ClientsScreen({ page }: { page: string | string[] | undefined }) {
  const requested = v.parse(ClientsPageSchema, page);
  const { clients, ...pages } = await listClientsForAdmin(requested);
  // Past the end (the last client on the last page was deleted, or an old link): the last page.
  if (pages.page !== requested) redirect(clientsPageHref(pages.page));
  return (
    <>
      <PageHeader
        title="OIDC clients"
        description="Apps that sign people in through this server."
        action={clients.length > 0 ? <CreateClientDialog /> : undefined}
      />
      {clients.length > 0 ? (
        <>
          <ClientsTable clients={clients} />
          {pages.pageCount > 1 ? <ClientsPagination {...pages} /> : null}
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
