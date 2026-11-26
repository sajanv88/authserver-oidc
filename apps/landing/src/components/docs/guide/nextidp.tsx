import { repo } from "@/content/site";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Step, Steps } from "../steps/steps";

const NPM = "https://www.npmjs.com/package/nextidp";

/** nextidp: the package that does an app's side of sign-in, and checks tokens for APIs. */
export function Nextidp() {
  return (
    <Section id="nextidp" title="Apps and APIs with nextidp">
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

      <Subheading id="nextidp-node">Express and Node apps</Subheading>
      <p className="article__text">
        The same settings and routes, from <C>nextidp/express</C> or, for Node's own HTTP server,{" "}
        <C>nextidp/node</C> (<C>auth.handle(req, res)</C>, then <C>auth.requireSession(req, res)</C>
        ).
      </p>
      <Code
        language="ts"
        title="app.ts"
        label="Signing people in to an Express app"
        code={`import express from "express";
import { idp } from "nextidp/express";

const auth = idp();
const app = express();

// nextidp's routes, and the session (refreshed before it expires) on every other request.
app.use(auth.express());

app.get("/dashboard", auth.requireSession(), (req, res) => {
  res.render("dashboard", { user: auth.sessionOf(req)?.user });
});`}
      />

      <Subheading id="nextidp-api">Protecting your API</Subheading>
      <p className="article__text">
        An API needs only <C>IDP_ISSUER</C> and <C>IDP_AUDIENCE</C>, its own URI exactly as in{" "}
        <C>OAUTH_RESOURCES</C>. Apps that call it ask for tokens with that URI as <C>resource</C>,
        so they get JWTs nextidp checks against the published keys: signature, issuer, audience,
        expiry and the scopes each route needs, with no call to this server per request. A refused
        call gets 401 or 403 with the RFC 6750 challenge.
      </p>
      <Code
        language="ts"
        title="NestJS: app.module.ts and orders.controller.ts"
        label="Protecting a NestJS API"
        code={`import { CurrentToken, IdpModule, Public, Scopes, type AccessToken } from "nextidp/nestjs";

@Module({ imports: [IdpModule.forRoot()] }) // every route needs a token, unless @Public()
export class AppModule {}

@Controller("orders")
@Scopes("orders:read")
export class OrdersController {
  @Get()
  list(@CurrentToken() token: AccessToken) {
    return this.orders.of(token.subject);
  }

  @Public()
  @Get("health")
  health() {}
}`}
      />
      <Code
        language="ts"
        title="Express, or a Next.js route handler"
        label="Protecting an Express API or a route handler"
        code={`import { idp } from "nextidp/express";
const auth = idp();
app.get("/orders", auth.requireToken({ scopes: ["orders:read"] }), (req, res) =>
  res.json(ordersOf(auth.tokenOf(req)?.subject)),
);

// Next.js: src/app/api/orders/route.ts
export const GET = auth.withToken({ scopes: ["orders:read"] }, async (request, { token }) =>
  Response.json(await ordersOf(token.subject)),
);`}
      />
    </Section>
  );
}
