import { repo } from "@/content/site";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Step, Steps } from "../steps/steps";

const NPM = "https://www.npmjs.com/package/nextidp";

/** nextidp: the package that does an app's side of sign-in, for Next.js apps. */
export function Nextidp() {
  return (
    <Section id="nextidp" title="Sign in from a Next.js app with nextidp">
      <p className="article__text">
        <a href={NPM}>nextidp</a> does an app's whole side of OpenID Connect in one call: the code
        flow with PKCE, the ID token's checks, an encrypted session cookie (no database), refreshing
        tokens before they expire, and signing out of the app or of this server too. It's what the{" "}
        <a href={repo("tree/main/apps/example-client")}>example client</a> runs on.
      </p>
      <Steps>
        <Step title="Install it and register the app">
          <Code language="sh" title="Terminal" label="Installing nextidp" code="npm i nextidp" />
          <p className="article__text">
            In OIDC clients, register the app with the redirect URI{" "}
            <C>https://app.example.com/auth/callback</C>. Public works (PKCE alone), or confidential
            if the app keeps a secret.
          </p>
        </Step>
        <Step title="Give it five settings">
          <Code
            language="dotenv"
            title=".env"
            label="nextidp's settings"
            code={`IDP_ISSUER=https://auth.example.com
IDP_CLIENT_ID=your-client-id
# Confidential clients only
IDP_CLIENT_SECRET=
IDP_APP_URL=https://app.example.com
# At least 32 characters: openssl rand -base64 32
IDP_SECRET=`}
          />
        </Step>
        <Step title="Call idp(), and add its route and the proxy">
          <Code
            language="ts"
            title="src/auth.ts"
            label="Creating the client"
            code={`import { idp } from "nextidp/next";

// Reads IDP_* on first use, so \`next build\` needs none of them.
export const auth = idp();`}
          />
          <Code
            language="ts"
            title="src/app/auth/[...nextidp]/route.ts"
            label="nextidp's routes"
            code={`import { auth } from "@/auth";

export const { GET, POST } = auth.routes();`}
          />
          <Code
            language="ts"
            title="src/proxy.ts"
            label="The proxy"
            code={`import { auth } from "@/auth";

// Signed-out visitors of /dashboard go to sign in; tokens are refreshed before they expire.
export const proxy = auth.proxy({ protect: ["/dashboard"] });

export const config = { matcher: ["/((?!auth/|_next/|favicon.ico).*)"] };`}
          />
        </Step>
        <Step title="Read the session">
          <Code
            language="tsx"
            title="src/app/dashboard/page.tsx"
            label="Using the session"
            code={`import { auth } from "@/auth";

export default async function Dashboard() {
  const session = await auth.requireSession("/dashboard");
  return <h1>Hello, {session.user.name ?? session.user.email}</h1>;
}

// Sign in: <a href="/auth/login?returnTo=/dashboard">Sign in</a>
// Sign out: <form method="post" action="/auth/logout">, with a button named
// signOutOfIdp and the value true to sign out of the auth server too.`}
          />
          <p className="article__text">
            <C>session.accessToken</C> calls your APIs as the person. The refresh token and the ID
            token stay in the encrypted cookie: nothing in the browser can read them.
          </p>
        </Step>
      </Steps>

      <Subheading id="nextidp-routes">Its routes, and when a sign-in fails</Subheading>
      <DataTable
        caption="nextidp's routes"
        head={["Route", "What it does"]}
        rows={[
          [
            <C key="r">GET /auth/login?returnTo=/path</C>,
            "Starts a sign-in that comes back to the path",
          ],
          [<C key="r">GET /auth/callback</C>, "Finishes it: the redirect URI you registered"],
          [
            <C key="r">POST /auth/logout</C>,
            "Revokes the refresh token and ends the app's session",
          ],
          [<C key="r">POST /auth/refresh</C>, "New tokens now, then back to the form's returnTo"],
        ]}
      />
      <p className="article__text">
        A failed sign-in lands on <C>/?error=</C> with <C>access_denied</C>, <C>expired</C>,{" "}
        <C>state_mismatch</C>, <C>token_failed</C>, <C>invalid_id_token</C> or <C>refresh_failed</C>
        , for your page to explain. The <a href={NPM}>README</a> lists every setting.
      </p>
    </Section>
  );
}
