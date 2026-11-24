import { Badge } from "@nuvui/react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import type { ClientRow } from "../../types";
import { ClientActions } from "../client-actions/client-actions";
import { CopyClientId } from "../copy-client-id/copy-client-id";
import "./clients-table.scss";

const created = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** The clients, newest first. */
export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  return (
    <TableContainer aria-label="OIDC clients">
      <Table>
        <TableCaption visuallyHidden>OIDC clients, newest first</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Client ID</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Redirect URIs</TableHead>
            <TableHead>Created</TableHead>
            <TableHead align="end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.clientId}>
              <TableCell rowHeader>
                <span className="clients-table__name">{client.name}</span>
                {client.disabled ? (
                  <Badge intent="warning" variant="outline">
                    Disabled
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>
                <CopyClientId clientId={client.clientId} name={client.name} />
              </TableCell>
              <TableCell>
                <Badge intent={client.kind === "public" ? "neutral" : "primary"}>
                  {client.kind === "public" ? "Public" : "Confidential"}
                </Badge>
              </TableCell>
              <TableCell>
                <ul className="clients-table__uris">
                  {client.redirectUris.map((uri) => (
                    <li key={uri} className="clients-table__code">
                      {uri}
                    </li>
                  ))}
                </ul>
              </TableCell>
              <TableCell>
                <time dateTime={client.createdAt}>
                  {created.format(new Date(client.createdAt))}
                </time>
              </TableCell>
              <TableCell align="end">
                <ClientActions client={client} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
