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
import Link from "next/link";
import { UserAvatar } from "@/shared/ui/user-avatar/user-avatar";
import { userPath } from "../../paths";
import type { UserRow } from "../../types";
import { dayFormat, StatusBadge, TwoFactorBadge } from "../user-badges";
import "./users-table.scss";

/** The users, newest first. Each name opens the user's page. */
export function UsersTable({ users }: { users: UserRow[] }) {
  return (
    <TableContainer aria-label="Users">
      <Table>
        <TableCaption visuallyHidden>Users, newest first</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Two-factor</TableHead>
            <TableHead>Last active</TableHead>
            <TableHead>Joined</TableHead>
          </TableRow>
        </TableHeader>
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
