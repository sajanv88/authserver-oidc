import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import type { ReactNode } from "react";
import "./content.scss";

/** Code inside a sentence. Blocks of code are `Code`. */
export function C({ children }: { children: ReactNode }) {
  return <code className="inline-code">{children}</code>;
}

/** A plain table of settings or values; the first cell of each row is its heading. */
export function DataTable({
  caption,
  head,
  rows,
}: {
  /** The table's name for screen readers. */
  caption: string;
  head: string[];
  rows: ReactNode[][];
}) {
  return (
    <TableContainer className="data-table">
      <Table aria-label={caption}>
        <TableHeader>
          <TableRow>
            {head.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, r) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static rows that never reorder
            <TableRow key={r}>
              {row.map((cell, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static cells that never reorder
                <TableCell key={c} rowHeader={c === 0}>
                  {cell}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
