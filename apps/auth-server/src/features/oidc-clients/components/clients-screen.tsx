import { GridIcon } from "@nuvui/icons";
import { Empty, EmptyActions, EmptyDescription, EmptyMedia, EmptyTitle } from "@nuvui/react";
import { PageHeader } from "@/shared/ui/page-header/page-header";
import { listClientsForAdmin } from "../server/clients";
import { ClientsTable } from "./clients-table/clients-table";
import { CreateClientDialog } from "./create-client-dialog/create-client-dialog";

/** /admin/clients: the apps that sign people in here. Checks the admin session itself. */
export async function ClientsScreen() {
  const clients = await listClientsForAdmin();
  return (
    <>
      <PageHeader
        title="OIDC clients"
        description="Apps that sign people in through this server."
        action={clients.length > 0 ? <CreateClientDialog /> : undefined}
      />
      {clients.length > 0 ? (
        <ClientsTable clients={clients} />
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
