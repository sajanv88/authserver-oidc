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
import "./claims-table.scss";

const TIME_CLAIMS = new Set(["exp", "iat", "auth_time", "nbf", "updated_at"]);

const when = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "UTC",
});

function show(name: string, value: unknown): string {
  if (TIME_CLAIMS.has(name) && typeof value === "number") {
    return `${value} (${when.format(new Date(value * 1000))} UTC)`;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function ClaimsTable({
  claims,
  caption,
}: {
  claims: Record<string, unknown>;
  caption: string;
}) {
  return (
    <TableContainer aria-label={caption}>
      <Table>
        <TableCaption visuallyHidden>{caption}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Claim</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(claims).map(([name, value]) => (
            <TableRow key={name}>
              <TableCell rowHeader>
                <code className="claims-table__code">{name}</code>
              </TableCell>
              <TableCell>
                <span className="claims-table__value">{show(name, value)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
