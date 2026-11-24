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
import type { Route } from "next";
import Link from "next/link";
import type { PageWindow } from "@/shared/validation/paging";
import "./list-pagination.scss";

type ListPaginationProps = PageWindow & {
  /** What the list holds, in the plural: "clients", "sessions". */
  things: string;
  /** The address of a page of the list. */
  hrefFor: (page: number) => Route;
};

/** Links to the other pages of a list, as links, and which things this page shows. */
export function ListPagination({
  page,
  pageCount,
  total,
  perPage,
  things,
  hrefFor,
}: ListPaginationProps) {
  const first = (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);
  return (
    <div className="list-pagination">
      <p className="list-pagination__summary">
        {first}–{last} of {total} {things}
      </p>
      <Pagination aria-label={`Pages of ${things}`}>
        <PaginationList>
          <PaginationItem>
            {page > 1 ? (
              <PaginationPrevious asChild>
                <Link href={hrefFor(page - 1)}>Previous</Link>
              </PaginationPrevious>
            ) : (
              <PaginationPrevious disabled />
            )}
          </PaginationItem>
          {paginationRange({ page, count: pageCount }).map((entry) => (
            <PaginationItem key={entry}>
              {typeof entry === "number" ? (
                <PaginationLink asChild active={entry === page}>
                  <Link href={hrefFor(entry)} aria-label={`Page ${entry}`}>
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
                <Link href={hrefFor(page + 1)}>Next</Link>
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
