import { Button } from "@nuvui/react";

/**
 * Signs out of this app: a plain form POST to the route handler, which checks the Origin,
 * revokes the refresh token and clears this app's cookie. The auth server's session stays.
 */
export function SignOutForm() {
  return (
    <form method="post" action="/oidc/logout">
      <Button type="submit" intent="secondary">
        Sign out of this app
      </Button>
    </form>
  );
}
