import { type Executor, revokeUserOAuthTokens } from "@repo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { mustSetUpTwoFactor, type TwoFactorPolicy, twoFactorRequired } from "./two-factor-policy";

// Rules on Better Auth's own endpoints that the admin screens rely on. They're hooks, not checks
// in the screens' server actions, because the endpoints are public: an admin's browser can call
// /api/auth/admin/* directly, and an app can call /api/auth/get-session.

/** The roles the users table takes (its user_role enum). */
const ROLES = new Set(["user", "admin"]);

/** The plugin's endpoints that end a user's sessions without deleting the user. */
const ENDS_SESSIONS = new Set(["/admin/ban-user", "/admin/revoke-user-sessions"]);

/** Whether an after hook's endpoint answered, rather than threw. */
function succeeded(returned: unknown): boolean {
  return !(returned instanceof Error);
}

function userIdOf(body: unknown): string | undefined {
  const userId = (body as { userId?: unknown } | undefined)?.userId;
  return typeof userId === "string" ? userId : undefined;
}

export function accountPolicy({
  database,
  twoFactor,
}: {
  database: Executor;
  twoFactor: TwoFactorPolicy;
}): BetterAuthPlugin {
  return {
    id: "account-policy",
    hooks: {
      before: [
        {
          // Roles are a closed set, and no admin changes their own: that's how the last admin
          // would lock everyone out.
          matcher: (context) => context.path === "/admin/set-role",
          handler: createAuthMiddleware(async (ctx) => {
            const role: unknown = ctx.body?.role;
            if (typeof role !== "string" || !ROLES.has(role)) {
              throw new APIError("BAD_REQUEST", {
                code: "INVALID_ROLE",
                message: "The role must be user or admin.",
              });
            }
            const session = await getSessionFromCtx(ctx);
            if (session && userIdOf(ctx.body) === session.user.id) {
              throw new APIError("BAD_REQUEST", {
                code: "YOU_CANNOT_CHANGE_YOUR_OWN_ROLE",
                message: "Another admin has to change your role.",
              });
            }
          }),
        },
        {
          // Someone who must have two-factor can't turn it off.
          matcher: (context) => context.path === "/two-factor/disable",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session && twoFactorRequired(session.user, twoFactor)) {
              throw new APIError("FORBIDDEN", {
                code: "TWO_FACTOR_REQUIRED",
                message: "Two-factor authentication is required for this account.",
              });
            }
          }),
        },
      ],
      after: [
        {
          // Ending someone's sessions ends their apps' access too. The OAuth plugin revokes a
          // session's tokens when it ends, but keeps refresh tokens with offline_access, which
          // would let an app go on for up to 30 days after the account was disabled.
          matcher: (context) => ENDS_SESSIONS.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const userId = userIdOf(ctx.body);
            if (!userId || !succeeded(ctx.context.returned)) return;
            await revokeUserOAuthTokens(database, userId);
          }),
        },
        {
          // An app reading the shared session cookie gets no session until someone who must
          // have two-factor has set it up, as an app signing in through OIDC gets no code. Only
          // over HTTP: this server's own pages read the session through the server API, and
          // send such a person to set it up.
          matcher: (context) => context.path === "/get-session",
          handler: createAuthMiddleware(async (ctx) => {
            if (!ctx.request) return;
            const returned = ctx.context.returned as { user?: Record<string, unknown> } | null;
            if (returned?.user && mustSetUpTwoFactor(returned.user, twoFactor)) {
              return ctx.json(null);
            }
            return undefined;
          }),
        },
      ],
    },
  };
}
