import adminUser from "@/content/docs/admin-user.png";
import sessions from "@/content/docs/sessions.png";
import twoFactor from "@/content/docs/two-factor.png";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";

export function Security() {
  return (
    <Section id="security" title="Security">
      <p className="article__text">
        Most of it is on from the first start. A few settings are yours, because they depend on
        where the server runs.
      </p>
      <Subheading id="security-defaults">On by default</Subheading>
      <ul className="article__list">
        <li>
          PKCE (S256) on every sign-in; no implicit flow, no device flow, no self-registration.
        </li>
        <li>
          RS256 ID tokens that last 10 minutes, access tokens too; refresh tokens last 30 days and
          rotate on each use, and reusing a spent one revokes its whole family.
        </li>
        <li>Client secrets and pushed requests stored as hashes, not values.</li>
        <li>
          A nonce-based Content Security Policy on every page, <C>form-action &apos;self&apos;</C>,
          and the usual security headers.
        </li>
        <li>
          Rate limits per client IP on sign-in, sign-up, codes, tokens and every email (5 sign-ins a
          minute, 30 token requests a minute).
        </li>
        <li>
          Sign-up, password reset and sign-in links answer the same whether or not an account
          exists, and in the same time: emails are rendered and sent after the response.
        </li>
      </ul>
      <Subheading id="security-yours">Yours to set</Subheading>
      <DataTable
        caption="Security settings"
        head={["Setting", "Set it to"]}
        rows={[
          [
            <C key="s">BETTER_AUTH_SECRET</C>,
            "At least 32 random characters, from a secret store. It signs sessions and the requests carried between sign-in steps.",
          ],
          [
            <C key="u">BETTER_AUTH_URL</C>,
            "Your https origin, with no path: it's also the OIDC issuer. Production refuses http.",
          ],
          [
            <C key="o">TRUSTED_ORIGINS</C>,
            "Every app origin that calls the server, exactly, https in production. No wildcards.",
          ],
          [
            <C key="p">TRUSTED_PROXIES</C>,
            "Your proxy's or ingress pods' addresses (IPs or CIDRs). The client IP for rate limiting is the rightmost X-Forwarded-For hop that isn't one of them: left empty, every request seems to come from the proxy.",
          ],
          [
            <C key="c">COOKIE_DOMAIN</C>,
            "Only if apps on sibling subdomains should share the session cookie. Every subdomain then receives it, so only for apps you fully trust.",
          ],
          [
            <C key="t">TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY</C>,
            "Optional: Cloudflare Turnstile on every form and the endpoints behind them. Both or neither.",
          ],
          [
            <C key="2">TWO_FACTOR_REQUIRED_FOR_ADMINS</C>,
            "Optional: true makes every admin set up two-factor before anything else, apps included.",
          ],
        ]}
      />
      <Code language="sh" title="Terminal" label="A secret" code="openssl rand -base64 32" />
      <Subheading id="security-users">What your users get</Subheading>
      <p className="article__text">
        Under <strong>My profile</strong>, everyone can change their password (which signs out their
        other devices), turn on two-factor authentication with any authenticator app and ten backup
        codes, and see and end their sessions.
      </p>
      <Shot
        src={twoFactor}
        narrow
        alt="Add this account to your app: a QR code, the setup key in groups of four, and six boxes for the code from the app, with a Turn on two-factor button."
        caption="Two-factor set-up, after the password: scan the code or type the key, then enter a code to turn it on."
      />
      <Shot
        src={sessions}
        alt="The Sessions page of My profile: where you're signed in, with this device marked and a Sign out everywhere button, beside tabs for Password, Two-factor and Sessions."
        caption="Every device the account is signed in on, ten to a page. Signing one out ends its session at once; apps with back-channel logout are told."
      />
      <Subheading id="security-admins">Managing people</Subheading>
      <p className="article__text">
        Admins find anyone under <strong>Users</strong>, by name, email or status, and open them to:
      </p>
      <ul className="article__list">
        <li>
          <strong>Disable</strong> the account, for a day, a week, a month or until enabled again.
          It can't sign in by any method, its sessions end, and every token its apps hold is
          revoked, offline access included.
        </li>
        <li>
          <strong>Sign them out everywhere</strong>, with the same revocation, for a lost laptop or
          someone leaving.
        </li>
        <li>
          <strong>Require two-factor</strong>: until it's on, every page and every app's sign-in
          sends them to set it up first. <strong>Reset</strong> it for a lost phone.
        </li>
        <li>
          Make them an admin, or a user again, and <strong>delete</strong> the account once its
          email is typed, for a GDPR request.
        </li>
      </ul>
      <p className="article__text">
        The person gets an email when their account is disabled, enabled, deleted, or its two-factor
        is reset. Each change is kept in the account&apos;s history: what, when and by whom. No
        admin can do these to their own account.
      </p>
      <Shot
        src={adminUser}
        alt="Ada Lovelace's admin page: her name, email and status, when she joined and was last active, the devices she's signed in on and her two-factor. Below, where she's signed in (Safari on macOS and Chrome on Android) with Sign out everywhere; Manage the account, with rows for access, two-factor, a lost phone and her role; the danger zone with Delete; and beside them the history of what admins changed."
        caption="One person's page under Users: where they're signed in, what can be changed, and what admins already did. Every action asks first."
      />
    </Section>
  );
}
