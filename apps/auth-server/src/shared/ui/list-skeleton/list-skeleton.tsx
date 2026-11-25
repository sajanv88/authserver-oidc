import { Item, ItemContent, ItemMedia, Skeleton, VisuallyHidden } from "@nuvui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import "./list-skeleton.scss";

// Placeholders in the shape of a list that's loading, built from the same parts as the list, so
// nothing jumps when it arrives. The gray boxes are hidden from screen readers; aria-busy and a
// status (when `label` is given) say what's going on.

/** Placeholders with nothing to tell apart but their place. */
function places(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** Rows shaped like an `Item` list's (a session list, settings rows): an icon and two lines. */
export function RowsSkeleton({ count, label }: { count: number; label?: string | undefined }) {
  return (
    <div aria-busy="true" className="list-skeleton">
      {label ? <VisuallyHidden role="status">{label}</VisuallyHidden> : null}
      {places(count).map((place) => (
        <Item key={place} variant="outline" aria-hidden="true">
          <ItemMedia>
            <Skeleton className="list-skeleton__icon" />
          </ItemMedia>
          <ItemContent>
            <Skeleton shape="text" className="list-skeleton__title" />
            <Skeleton shape="text" className="list-skeleton__text" />
          </ItemContent>
        </Item>
      ))}
    </div>
  );
}

/** A table's headings with rows of placeholders under them. */
export function TableSkeleton({
  columns,
  rows,
  label,
}: {
  columns: readonly string[];
  rows: number;
  label?: string | undefined;
}) {
  return (
    <div aria-busy="true">
      {label ? <VisuallyHidden role="status">{label}</VisuallyHidden> : null}
      <div aria-hidden="true">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {places(rows).map((row) => (
                <TableRow key={row}>
                  {columns.map((column) => (
                    <TableCell key={column}>
                      <Skeleton shape="text" className="list-skeleton__cell" />
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
}
