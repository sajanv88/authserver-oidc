import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";

/** What /login is told when a provider's sign-in was refused for this reason. */
export const TWO_FACTOR_REQUIRED_ERROR = "two_factor_required";

/** Where a provider signs someone in: its callback, or /sign-in/social itself. */
function providerSignIn(path: string | undefined): boolean {
  return (path ?? "").startsWith("/callback/") || path === "/sign-in/social";
}

/**
 * Better Auth asks for the second factor only after a password. A provider's sign-in comes
 * without one, so an account with two-factor on would be entered on the provider's word
 * alone. As magic links aren't sent to those accounts, this refuses them: the session the
 * sign-in made is deleted and its cookie expired, and the browser goes to the login page to
 * sign in with the password and the code.
 *
 * /sign-in/social can also sign someone in at once from a provider's ID token in the body (a
 * flow for native apps and One Tap). Nothing here uses it, so it's refused outright, before
 * the endpoint runs; the check after it is a second line.
 *
 * It must come before oauthProvider() in the plugins: that one continues an app's flow when
 * a sign-in sets a session cookie, and this one takes the session away first.
 */
export function socialTwoFactorGuard(loginPage: string): BetterAuthPlugin {
  return {
    id: "social-two-factor-guard",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/sign-in/social",
          handler: createAuthMiddleware(async (ctx) => {
            if (ctx.body?.idToken !== undefined) {
              throw new APIError("FORBIDDEN", {
                code: "ID_TOKEN_SIGN_IN_DISABLED",
                message: "Sign in through the provider's own page.",
              });
            }
          }),
        },
      ],
      after: [
        {
          matcher: (context) => providerSignIn(context.path),
          handler: createAuthMiddleware(async (ctx) => {
            const signedIn = ctx.context.newSession;
            if (!signedIn?.user.twoFactorEnabled) return;
            deleteSessionCookie(ctx, true);
            await ctx.context.internalAdapter.deleteSession(signedIn.session.token);
            ctx.context.setNewSession(null);
            throw ctx.redirect(`${loginPage}?error=${TWO_FACTOR_REQUIRED_ERROR}`);
          }),
        },
      ],
    },
  };
}
