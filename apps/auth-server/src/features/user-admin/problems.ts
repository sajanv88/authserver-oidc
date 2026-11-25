import type { AdminProblem } from "./types";

/** Why an admin action didn't happen, in words an admin can act on. */
export const ADMIN_PROBLEMS: Record<AdminProblem, string> = {
  "not-found": "That account no longer exists. Go back to the list.",
  self: "You can't do that to your own account. Ask another admin.",
  "not-allowed": "Your admin session has ended. Sign in again.",
  failed: "The server couldn't do that. The reason is in its log.",
};
