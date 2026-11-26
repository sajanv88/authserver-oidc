import { Button } from "@nuvui/react";
import "./sign-out-form.scss";

/**
 * Signing out: a plain form POST to nextidp's /oidc/logout, which checks the Origin, revokes
 * the refresh token and clears this app's cookie. "Of this app" leaves the auth server's session,
 * so the next sign-in goes straight through; "of the auth server too" then sends the browser
 * to its end-session endpoint (RP-initiated logout), which comes back to the home page.
 */
export function SignOutForm() {
  return (
    <form method="post" action="/oidc/logout" className="sign-out-form">
      <Button type="submit" name="signOutOfIdp" value="false" intent="secondary">
        Sign out of this app
      </Button>
      <Button type="submit" name="signOutOfIdp" value="true" intent="secondary">
        Sign out of the auth server too
      </Button>
    </form>
  );
}
