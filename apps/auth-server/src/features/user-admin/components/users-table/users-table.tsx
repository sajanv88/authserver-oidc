import { Badge, Skeleton } from "@nuvui/react";
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
import Link from "next/link";
import { UserAvatar } from "@/shared/ui/user-avatar/user-avatar";
import { userPath } from "../../paths";
import type { UserRow } from "../../types";
import { dayFormat, StatusBadge, TwoFactorBadge } from "../user-badges";
import "./users-table.scss";

const COLUMNS = ["Person", "Role", "Status", "Two-factor", "Last active", "Joined"] as const;

function Headings() {
  return (
    <TableHeader>
      <TableRow>
        {COLUMNS.map((column) => (
          <TableHead key={column}>{column}</TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

/** The table's shape while it loads, hidden from screen readers (the page says it's loading). */
export function UsersTableSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true">
      <TableContainer>
        <Table>
          <Headings />
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed placeholders, never reordered
              <TableRow key={row}>
                <TableCell>
                  <span className="users-table__person">
                    <Skeleton shape="circle" className="users-table__avatar-skeleton" />
                    <span className="users-table__who">
                      <Skeleton shape="text" className="users-table__skeleton--name" />
                      <Skeleton shape="text" className="users-table__skeleton--email" />
                    </span>
                  </span>
                </TableCell>
                {COLUMNS.slice(1).map((column) => (
                  <TableCell key={column}>
                    <Skeleton shape="text" className="users-table__skeleton--cell" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

/** The users, newest first. Each name opens the user's page. */
export function UsersTable({ users }: { users: UserRow[] }) {
  return (
    <TableContainer aria-label="Users">
      <Table>
        <TableCaption visuallyHidden>Users, newest first</TableCaption>
        <Headings />
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell rowHeader>
                <span className="users-table__person">
                  <UserAvatar user={user} size="sm" />
                  <span className="users-table__who">
                    <Link className="users-table__name" href={userPath(user.id)}>
                      {user.name.trim() || user.email}
                    </Link>
                    <span className="users-table__email">{user.email}</span>
                  </span>
                </span>
              </TableCell>
              <TableCell>
                {user.role === "admin" ? <Badge variant="outline">Admin</Badge> : "User"}
              </TableCell>
              <TableCell>
                <StatusBadge status={user.status} />
              </TableCell>
              <TableCell>
                <TwoFactorBadge state={user.twoFactor} />
              </TableCell>
              <TableCell>
                {user.lastActiveAt ? (
                  <time className="users-table__date" dateTime={user.lastActiveAt}>
                    {dayFormat.format(new Date(user.lastActiveAt))}
                  </time>
                ) : (
                  <span className="users-table__none">Not signed in</span>
                )}
              </TableCell>
              <TableCell>
                <time className="users-table__date" dateTime={user.createdAt}>
                  {dayFormat.format(new Date(user.createdAt))}
                </time>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
