import { UserXIcon } from "@nuvui/icons";
import {
  Button,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nuvui/react";
import Link from "next/link";
import { USERS_PATH } from "@/features/user-admin";

// A user id that isn't anyone's: an old link, or an account that was deleted.
export default function UserNotFound() {
  return (
    <Empty>
      <EmptyMedia>
        <UserXIcon />
      </EmptyMedia>
      <EmptyTitle asChild>
        <h1>No such user</h1>
      </EmptyTitle>
      <EmptyDescription>
        The account may have been deleted, or the link is out of date. Its history stays, but
        there's nothing left to manage.
      </EmptyDescription>
      <EmptyActions>
        <Button asChild intent="secondary">
          <Link href={USERS_PATH}>Back to Users</Link>
        </Button>
      </EmptyActions>
    </Empty>
  );
}
