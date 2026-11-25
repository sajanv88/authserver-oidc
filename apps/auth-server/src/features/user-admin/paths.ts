import type { UserStatus } from "@repo/db";
import type { Route } from "next";

export const USERS_PATH = "/admin/users";

/** A user's admin page. */
export function userPath(id: string): Route {
  return `${USERS_PATH}/${id}` as Route;
}

/** A user's admin page at a page of their sessions; page 1 is the page's own address. */
export function userHref(id: string, sessionsPage = 1): Route {
  return (sessionsPage > 1 ? `${userPath(id)}?page=${sessionsPage}` : userPath(id)) as Route;
}

/** The list's address for a page and a search; page 1 and no search is the list's own. */
export function usersHref({
  page = 1,
  search = "",
  status,
}: {
  page?: number;
  search?: string;
  status?: UserStatus | undefined;
}): Route {
  const query = new URLSearchParams();
  if (search) query.set("q", search);
  if (status) query.set("status", status);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return (text ? `${USERS_PATH}?${text}` : USERS_PATH) as Route;
}
