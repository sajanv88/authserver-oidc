import { SearchIcon } from "@nuvui/icons";
import { Button, Input, InputGroup, InputGroupAddon, Label, NativeSelect } from "@nuvui/react";
import type { UserStatus } from "@repo/db";
import Form from "next/form";
import Link from "next/link";
import { USERS_PATH } from "../../paths";
import "./users-filter.scss";

/**
 * Search and status, as a GET form: the list is the URL, so a search can be shared and the
 * back button works, and it works before JavaScript loads.
 */
export function UsersFilter({
  search,
  status,
}: {
  search: string;
  status: UserStatus | undefined;
}) {
  return (
    <Form action={USERS_PATH} className="users-filter" role="search" aria-label="Users">
      <div className="users-filter__field">
        <Label htmlFor="users-search">Name or email</Label>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon size={16} aria-hidden="true" />
          </InputGroupAddon>
          <Input
            id="users-search"
            name="q"
            type="search"
            defaultValue={search}
            maxLength={100}
            autoComplete="off"
          />
        </InputGroup>
      </div>
      <div className="users-filter__field">
        <Label htmlFor="users-status">Status</Label>
        <NativeSelect id="users-status" name="status" defaultValue={status ?? ""}>
          <option value="">Everyone</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
          <option value="unconfirmed">Unconfirmed</option>
        </NativeSelect>
      </div>
      <div className="users-filter__actions">
        <Button type="submit" intent="secondary">
          Search
        </Button>
        {search || status ? (
          <Button asChild intent="ghost">
            <Link href={USERS_PATH}>Clear</Link>
          </Button>
        ) : null}
      </div>
    </Form>
  );
}
