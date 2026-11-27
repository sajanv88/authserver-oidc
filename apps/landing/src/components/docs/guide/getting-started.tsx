import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import adminClients from "@/content/docs/admin-clients.png";
import signIn from "@/content/docs/sign-in.webp";
import { repo } from "@/content/site";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";
import { Step, Steps } from "../steps/steps";

export function BeforeYouStart() {
  return (
    <Section id="before-you-start" title="Before you start">
      <p className="article__text">
        The guide goes from a server on your machine to one in a Kubernetes cluster, in the order
        you'd set it up. Each part stands on its own, so skip to the one you need.
      </p>
      <DataTable
        caption="What you need"
        head={["For", "You need"]}
        rows={[
          ["Running it locally", "Docker, Node.js 26 and pnpm 12"],
          [
            "Production",
            "A PostgreSQL 17 database, an SMTP server, and HTTPS in front of the server",
          ],
          ["Kubernetes", "Helm 3.8 or later (OCI charts), an ingress controller, cert-manager"],
        ]}
      />
      <p className="article__text">
        Every setting is an environment variable, checked when the server starts: a missing or wrong
        one stops it with a message naming the variable. The full list, with a line on each, is{" "}
        <a href={repo("blob/main/.env.example")}>.env.example</a>.
      </p>
    </Section>
  );
}

export function RunLocally() {
  return (
    <Section id="run-locally" title="Run it locally with Docker Compose">
      <p className="article__text">
        The repository's <C>compose.yaml</C> runs PostgreSQL for development, on the loopback
        address only. The server and the example app run on your machine, in development mode.
      </p>
      <Steps>
        <Step title="Clone it and install">
          <Code
            language="sh"
            title="Terminal"
            label="Clone and install"
            code={`git clone https://github.com/sajanv88/next-identity-server.git
cd next-identity-server
pnpm install`}
          />
        </Step>
        <Step title="Create your .env">
          <p className="article__text">
            Copy the example, then set <C>BETTER_AUTH_SECRET</C> (at least 32 random characters) and{" "}
            <C>SEED_ADMIN_PASSWORD</C> (at least 12). Everything else has a working default for
            development.
          </p>
          <Code
            language="sh"
            title="Terminal"
            label="Create .env"
            code={`cp .env.example .env
openssl rand -base64 32   # paste it as BETTER_AUTH_SECRET`}
          />
        </Step>
        <Step title="Start PostgreSQL">
          <Code
            language="sh"
            title="Terminal"
            label="Start the database"
            code={`docker compose up -d
# Port 5432 taken? Pick another one, and use it in DATABASE_URL:
# POSTGRES_PORT=55432 docker compose up -d`}
          />
        </Step>
        <Step title="Create the tables">
          <Code language="sh" title="Terminal" label="Migrate" code="pnpm db:migrate" />
        </Step>
        <Step title="Seed an admin and the example app">
          <Code language="sh" title="Terminal" label="Seed" code="pnpm db:seed" />
          <p className="article__text">
            It prints the example app's client ID: put it in <C>.env</C> as <C>EXAMPLE_CLIENT_ID</C>
            , with a random <C>EXAMPLE_SESSION_SECRET</C>. The next part says what the seed does.
          </p>
        </Step>
        <Step title="Start everything">
          <Code language="sh" title="Terminal" label="Start" code="pnpm dev" />
          <DataTable
            caption="What runs where"
            head={["Address", "What it is"]}
            rows={[
              [<C key="a">http://auth.localtest.me:3000</C>, "The auth server"],
              [
                <C key="b">http://app.localtest.me:3001</C>,
                "The example app, which signs in with it",
              ],
              [<C key="c">http://localhost:3002</C>, "This site"],
            ]}
          />
          <p className="article__text">
            <C>localtest.me</C> and its subdomains point at your own machine, so the server and the
            app get two names on one cookie domain without editing your hosts file. Emails are
            printed in the terminal, links included.
          </p>
        </Step>
      </Steps>
      <Shot
        src={signIn}
        alt="The sign-in page: an email field, a password field with a link to reset it, a Sign in button, and links to sign in by email or create an account."
        caption="The sign-in page, here with APP_NAME set to Acme ID. The screenshots in this guide come from the production image, running in Docker behind HTTPS."
      />
    </Section>
  );
}

export function FirstAdmin() {
  return (
    <Section id="admin" title="The first admin">
      <p className="article__text">
        Admins register the apps that sign people in. Nobody can make themselves one: sign-up can't
        set the role, so the first admin is made directly in the database.
      </p>
      <Subheading id="admin-seed">On your machine: the seed</Subheading>
      <p className="article__text">
        <C>pnpm db:seed</C> creates <C>SEED_ADMIN_EMAIL</C> (by default <C>admin@localtest.me</C>)
        with <C>SEED_ADMIN_PASSWORD</C>, its email already confirmed, and registers the example app
        as a public client. It goes through the same code as a sign-up, it's safe to run twice, and
        it refuses to run with <C>NODE_ENV=production</C>.
      </p>
      <Shot
        src={adminClients}
        alt="The OIDC clients page with three clients: Example app (public), Nightly jobs (confidential, no redirect URI) and Acme CRM (confidential), each with a copy button for its client ID, its redirect URI, the date and a menu."
        caption="Signed in as the seeded admin, OIDC clients lists every registered app. Each row's menu edits it, rotates its secret or deletes it."
      />
      <Subheading id="admin-production">In production: one SQL statement</Subheading>
      <Steps>
        <Step title="Sign up">
          <p className="article__text">
            Create your account on <C>/signup</C> and confirm your email, as anyone would.
          </p>
        </Step>
        <Step title="Make it an admin">
          <Code
            language="sql"
            title="psql"
            label="Make an admin"
            code="update users set role = 'admin' where email = 'you@example.com';"
          />
        </Step>
        <Step title="Sign in again">
          <p className="article__text">
            Sign out and back in. <strong>OIDC clients</strong> appears in the bar.
          </p>
        </Step>
      </Steps>
      <Alert intent="info">
        <AlertTitle>Clients from a file</AlertTitle>
        <AlertDescription>
          For many apps, or the same apps in every environment, declare them in a JSON file and run{" "}
          <C>pnpm clients:provision clients.json</C> as <C>PROVISION_ADMIN_EMAIL</C>. It creates
          what's missing and updates what changed, but never deletes. The scopes and APIs parts show
          a file.
        </AlertDescription>
      </Alert>
    </Section>
  );
}
