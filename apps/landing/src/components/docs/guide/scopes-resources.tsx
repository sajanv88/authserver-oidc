import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import consent from "@/content/docs/consent.webp";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";
import { Step, Steps } from "../steps/steps";

export function Scopes() {
  return (
    <Section id="scopes" title="Scopes">
      <p className="article__text">
        A scope is something an app asks for and the user agrees to on the consent screen. Four come
        with OpenID Connect; you add your own for your APIs.
      </p>
      <DataTable
        caption="The scopes"
        head={["Scope", "What the app gets"]}
        rows={[
          [<C key="o">openid</C>, "An ID token: who signed in (sub). Every sign-in asks for it."],
          [<C key="p">profile</C>, "Their name and picture."],
          [<C key="e">email</C>, "Their email address, and whether it's confirmed."],
          [
            <C key="f">offline_access</C>,
            "A refresh token, so the app can stay signed in. It rotates on every use.",
          ],
          [
            <C key="a">crm, booking…</C>,
            "Your API scopes, from OAUTH_API_SCOPES. The consent screen describes each one.",
          ],
        ]}
      />
      <Steps>
        <Step title="Offer your API scopes">
          <Code
            language="dotenv"
            title=".env"
            label="API scopes"
            code="OAUTH_API_SCOPES=crm,booking"
          />
          <p className="article__text">
            They're published in discovery (<C>scopes_supported</C>) beside the four above.
          </p>
        </Step>
        <Step title="Give them to the apps that need them">
          <p className="article__text">
            An app may ask only for the scopes it was registered with: anything else is refused with{" "}
            <C>invalid_scope</C>. Give a client its scopes in the provisioning file (next part).
          </p>
        </Step>
        <Step title="Ask for them at sign-in">
          <Code
            language="text"
            title="The authorization request"
            label="Asking for a scope"
            code="scope=openid profile email offline_access crm"
          />
        </Step>
      </Steps>
      <Shot
        src={consent}
        alt="The consent screen: Allow Acme CRM to use your account? It lists Know it's you, Your name and picture, Your email address, and Act for you in crm, with Deny and Allow buttons and the signed-in account."
        caption="What the user agrees to: each scope in words, the API scope included. An app registered as first party skips this screen."
      />
    </Section>
  );
}

export function Resources() {
  return (
    <Section id="resources" title="Your APIs (resources)">
      <p className="article__text">
        An API that trusts the auth server needs an access token meant for it, and only for it. Name
        each API by its URL (an RFC 8707 resource): a token asked for with that resource is a signed
        JWT whose audience is that API, which it checks against the published keys with no call to
        the auth server.
      </p>
      <Steps>
        <Step title="List your APIs">
          <Code
            language="dotenv"
            title=".env"
            label="Resources"
            code={`OAUTH_RESOURCES=https://api.example.com
OAUTH_API_SCOPES=crm,booking`}
          />
          <p className="article__text">
            https in production. They're added to the database when the server starts; removing one
            from the list doesn't delete it.
          </p>
        </Step>
        <Step title="Link each app to the APIs it may call">
          <p className="article__text">
            Only a linked app gets a token for an API; any other is refused with{" "}
            <C>invalid_target</C>. A <C>web</C> client signs people in; a <C>machine</C> client is a
            service calling the API as itself.
          </p>
          <Code
            language="json"
            title="clients.json"
            label="Clients linked to an API"
            code={`{
  "clients": [
    {
      "type": "web",
      "name": "Acme CRM",
      "redirectUris": ["https://crm.example.com/callback"],
      "scopes": ["crm"],
      "resources": ["https://api.example.com"]
    },
    {
      "type": "machine",
      "name": "Nightly jobs",
      "scopes": ["crm"],
      "resources": ["https://api.example.com"]
    }
  ]
}`}
          />
          <Code
            language="sh"
            title="Terminal"
            label="Provision"
            code={`pnpm clients:provision clients.json
# Acme CRM: created (client ID <its client ID>)
#   client secret, shown only now: <its secret>`}
          />
        </Step>
        <Step title="Ask for a token for the API">
          <p className="article__text">
            Add <C>resource</C> to the token request (or the authorization request). A service uses
            client credentials:
          </p>
          <Code
            language="sh"
            title="Terminal"
            label="A service's token"
            code={`curl -X POST https://auth.example.com/api/auth/oauth2/token \\
  -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=client_credentials \\
  -d scope=crm \\
  -d resource=https://api.example.com`}
          />
        </Step>
        <Step title="Check it in the API">
          <Code
            language="ts"
            title="require-token.ts"
            label="Checking a token"
            code={`import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.example.com";
const keys = createRemoteJWKSet(new URL("/jwks", issuer));

export async function requireToken(authorization: string | undefined, scope: string) {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error("No access token");
  const { payload } = await jwtVerify(token, keys, {
    issuer,
    audience: "https://api.example.com", // this API
    algorithms: ["RS256"],
  });
  if (!String(payload.scope).split(" ").includes(scope)) throw new Error("Missing scope");
  return payload; // sub for a person, client_id for a service
}`}
          />
        </Step>
      </Steps>
      <Subheading id="resources-without">Without a resource</Subheading>
      <p className="article__text">
        A token asked for without <C>resource</C> is opaque: for <C>/oauth2/userinfo</C> and
        introspection, not for your APIs.
      </p>
      <Alert intent="info">
        <AlertTitle>Signing out of every app</AlertTitle>
        <AlertDescription>
          Give a web client a <C>backchannelLogoutUri</C> in the file, and when a user's session
          ends here, the app is sent a signed logout token for it (for sessions where it holds a
          refresh token).
        </AlertDescription>
      </Alert>
    </Section>
  );
}
