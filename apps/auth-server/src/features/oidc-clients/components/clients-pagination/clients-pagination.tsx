import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  paginationRange,
} from "@nuvui/react";
import Link from "next/link";
import { CLIENTS_PER_PAGE } from "../../schemas/client";
import type { ClientsPage } from "../../types";
import "./clients-pagination.scss";

/** The address of a page of the client list; page 1 is the list's own. */
export function clientsPageHref(page: number) {
  return page > 1 ? (`/admin/clients?page=${page}` as const) : ("/admin/clients" as const);
}

/** Links to the other pages of the list, and which clients this one shows. */
export function ClientsPagination({ page, pageCount, total }: Omit<ClientsPage, "clients">) {
  const first = (page - 1) * CLIENTS_PER_PAGE + 1;
  const last = Math.min(page * CLIENTS_PER_PAGE, total);
  return (
    <div className="clients-pagination">
      <p className="clients-pagination__summary">
        {first}–{last} of {total} clients
      </p>
      <Pagination aria-label="Pages of clients">
        <PaginationList>
          <PaginationItem>
            {page > 1 ? (
              <PaginationPrevious asChild>
                <Link href={clientsPageHref(page - 1)}>Previous</Link>
              </PaginationPrevious>
            ) : (
              <PaginationPrevious disabled />
            )}
          </PaginationItem>
          {paginationRange({ page, count: pageCount }).map((entry) => (
            <PaginationItem key={entry}>
              {typeof entry === "number" ? (
                <PaginationLink asChild active={entry === page}>
                  <Link href={clientsPageHref(entry)} aria-label={`Page ${entry}`}>
                    {entry}
                  </Link>
                </PaginationLink>
              ) : (
                <PaginationEllipsis />
              )}
            </PaginationItem>
          ))}
          <PaginationItem>
            {page < pageCount ? (
              <PaginationNext asChild>
                <Link href={clientsPageHref(page + 1)}>Next</Link>
              </PaginationNext>
            ) : (
              <PaginationNext disabled />
            )}
          </PaginationItem>
        </PaginationList>
      </Pagination>
    </div>
  );
}
