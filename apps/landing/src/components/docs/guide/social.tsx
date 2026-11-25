import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import socialSignIn from "@/content/docs/social-sign-in.webp";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";
import { Step, Steps } from "../steps/steps";

export function SocialSignIn() {
  return (
    <Section id="social" title="Sign-in with Google, Microsoft, GitHub or your own OIDC provider">
      <p className="article__text">
        Each provider is off until its client ID and its secret are both set; setting only one of
        the two stops the server at startup. Turn on as many as you like: each gets a button above
        the email form, on the sign-in and sign-up pages.
      </p>
      <Steps>
        <Step title="Register the auth server with the provider">
          <p className="article__text">
            Create an OAuth app (Google Cloud Console, Microsoft Entra ID, GitHub's developer
            settings, or your identity provider) and give it this redirect URI, with your own{" "}
            <C>BETTER_AUTH_URL</C>:
          </p>
          <Code
            language="text"
            title="Redirect URI"
            label="Redirect URI"
            code="https://auth.example.com/api/auth/callback/<google | microsoft | github | sso>"
          />
        </Step>
        <Step title="Set its client ID and secret">
          <DataTable
            caption="Each provider's settings"
            head={["Provider", "Set", "Notes"]}
            rows={[
              [
                "Google",
                <C key="g">GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET</C>,
                "A Web application client.",
              ],
              [
                "Microsoft",
                <C key="m">MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID</C>,
                "The tenant is common, organizations, consumers, or your tenant's ID.",
              ],
              [
                "GitHub",
                <C key="h">GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET</C>,
                "An OAuth app, with the redirect URI as its callback URL.",
              ],
              [
                "Any OIDC provider",
                <C key="s">SSO_NAME, SSO_DISCOVERY_URL, SSO_CLIENT_ID, SSO_CLIENT_SECRET</C>,
                "Okta, Keycloak, Auth0, Entra ID… All four or none; the button says Continue with SSO_NAME.",
              ],
            ]}
          />
          <Code
            language="dotenv"
            title=".env"
            label="Google and GitHub"
            code={`GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
GITHUB_CLIENT_ID=Iv1.0123456789abcdef
GITHUB_CLIENT_SECRET=...`}
          />
        </Step>
        <Step title="Restart, and sign in">
          <p className="article__text">
            The buttons appear on the next start. An app signing someone in through the auth server
            sees no difference: the same ID token, whichever way they signed in.
          </p>
        </Step>
      </Steps>
      <Shot
        src={socialSignIn}
        alt="The sign-in page with Continue with Google, Continue with Microsoft and Continue with GitHub above the email and password fields."
        caption="With Google, Microsoft and GitHub configured, their buttons sit above the email form."
      />
      <Subheading id="social-accounts">How accounts are matched</Subheading>
      <ul className="article__list">
        <li>
          A provider's sign-in joins an existing account with the same email only when both
          addresses are confirmed. Otherwise it's refused, rather than handing someone else the
          account.
        </li>
        <li>
          Microsoft: a work account's email is trusted only from the one tenant{" "}
          <C>MICROSOFT_TENANT_ID</C> names, or when the app registration adds the optional{" "}
          <C>xms_edov</C> claim. Any organisation's admin can set any address on their own users.
        </li>
        <li>
          An account with two-factor on signs in with its password and code: a provider's sign-in is
          refused for it, because the provider can't ask for the second factor.
        </li>
        <li>
          Someone who only ever used a provider can add a password through <C>Forgot password</C>,
          as their profile page says.
        </li>
      </ul>
      <Alert intent="warning">
        <AlertTitle>Secrets stay secret</AlertTitle>
        <AlertDescription>
          The client IDs are configuration; the <C>*_CLIENT_SECRET</C>s belong in your secret store,
          next to <C>BETTER_AUTH_SECRET</C>. In Kubernetes they go in the Secret, as the last part
          shows.
        </AlertDescription>
      </Alert>
    </Section>
  );
}
