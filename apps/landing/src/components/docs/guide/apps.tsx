import { Alert, AlertDescription, AlertTitle } from "@nuvui/react";
import clientSecret from "@/content/docs/client-secret.png";
import newClient from "@/content/docs/new-client.png";
import { Code } from "../../code/code";
import { Section, Subheading } from "../article/article";
import { C, DataTable } from "../content/content";
import { Shot } from "../shot/shot";
import { Step, Steps } from "../steps/steps";

export function RegisterApp() {
  return (
    <Section id="register-app" title="Register an app">
      <p className="article__text">
        Every app that signs people in is registered by an admin, with the exact redirect URIs it
        may return to. There's no self-service registration.
      </p>
      <DataTable
        caption="Which kind of client"
        head={["Kind", "For", "Secret"]}
        rows={[
          [
            "Public",
            "Single-page apps, mobile and desktop apps: anything a user can read the code of",
            "None: PKCE alone proves it's the same app",
          ],
          [
            "Confidential",
            "Apps with a server that keeps a secret: Next.js, Rails, Django…",
            "A client secret, sent with Basic auth",
          ],
        ]}
      />
      <Steps>
        <Step title="Open OIDC clients, then New client">
          <p className="article__text">
            Give it a name, pick its kind, and list its redirect URIs, one per line, https in
            production.
          </p>
          <Shot
            src={newClient}
            narrow
            alt="The New client dialog: a Name field filled with Acme Billing, Public and Confidential choices with Confidential selected, and a Redirect URIs field with https://billing.localtest.me/callback."
            caption="A confidential client for a server-side app."
          />
        </Step>
        <Step title="Copy its credentials">
          <p className="article__text">
            The client ID goes in the app's configuration; for a confidential client, so does the
            secret. It's shown once: copy it now.
          </p>
          <Shot
            src={clientSecret}
            narrow
            alt="Acme Billing is ready: the client ID and the client secret, each with a Copy button, and a warning to copy the secret now because it's stored hashed and can't be shown again."
            caption="The secret is stored hashed: if it's lost, rotate it for a new one."
          />
        </Step>
        <Step title="Point the app's OIDC library at the issuer">
          <Code
            language="dotenv"
            title="The app's .env"
            label="The app's settings"
            code={`OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=          # only for a confidential client
OIDC_REDIRECT_URI=https://app.example.com/oidc/callback
OIDC_SCOPES="openid profile email offline_access"`}
          />
          <p className="article__text">
            Most libraries need nothing else: they read the endpoints from{" "}
            <C>/.well-known/openid-configuration</C>.
          </p>
        </Step>
      </Steps>
    </Section>
  );
}

export function Pkce() {
  return (
    <Section id="pkce" title="PKCE, step by step">
      <p className="article__text">
        Every sign-in uses the authorization code flow with PKCE (S256), public and confidential
        clients alike; a request without it is refused. Your library does this for you. By hand, it
        goes like this.
      </p>
      <Steps>
        <Step title="Make a verifier and its challenge">
          <Code
            language="ts"
            title="pkce.ts"
            label="A PKCE verifier"
            code={`import { createHash, randomBytes } from "node:crypto";

const verifier = randomBytes(32).toString("base64url"); // keep it until the callback
const challenge = createHash("sha256").update(verifier).digest("base64url");`}
          />
        </Step>
        <Step title="Send the user to /authorize with the challenge">
          <Code
            language="http"
            title="Redirect"
            label="The authorization request"
            code={`GET https://auth.example.com/api/auth/oauth2/authorize
  ?response_type=code
  &client_id=your-client-id
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Foidc%2Fcallback
  &scope=openid%20profile%20email%20offline_access
  &state=RANDOM_STATE
  &nonce=RANDOM_NONCE
  &code_challenge=THE_CHALLENGE
  &code_challenge_method=S256`}
          />
          <p className="article__text">
            Keep the state, the nonce and the verifier (encrypted, in a cookie or the session) until
            the user comes back.
          </p>
        </Step>
        <Step title="Swap the code, with the verifier">
          <Code
            language="sh"
            title="Terminal"
            label="The token request"
            code={`# A public client sends its client_id; a confidential one adds -u "$CLIENT_ID:$CLIENT_SECRET".
curl -X POST https://auth.example.com/api/auth/oauth2/token \\
  -d grant_type=authorization_code \\
  -d code=CODE_FROM_THE_CALLBACK \\
  -d redirect_uri=https://app.example.com/oidc/callback \\
  -d client_id=your-client-id \\
  -d code_verifier=THE_VERIFIER`}
          />
          <p className="article__text">
            Check the state first. The answer has an RS256 ID token, an access token, and with{" "}
            <C>offline_access</C> a refresh token. Verify the ID token against <C>/jwks</C> and
            check it carries your nonce before you trust it.
          </p>
        </Step>
      </Steps>
      <Subheading id="par">Optional: push the request first (PAR)</Subheading>
      <p className="article__text">
        With pushed authorization requests (RFC 9126), the app's server posts the same parameters to{" "}
        <C>/oauth2/par</C>, authenticated as at the token endpoint, and sends the browser to{" "}
        <C>/authorize</C> with only its client ID and a one-time <C>request_uri</C>, good for 60
        seconds. The request is checked before the user sees anything, and can't be altered on the
        way.
      </p>
      <Code
        language="sh"
        title="Terminal"
        label="A pushed request"
        code={`curl -X POST https://auth.example.com/api/auth/oauth2/par \\
  -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d response_type=code \\
  -d redirect_uri=https://app.example.com/oidc/callback \\
  -d scope="openid profile email" \\
  -d state=RANDOM_STATE \\
  -d code_challenge=THE_CHALLENGE \\
  -d code_challenge_method=S256
# 201 {"request_uri":"urn:ietf:params:oauth:request_uri:…","expires_in":60}
# Then: /api/auth/oauth2/authorize?client_id=your-client-id&request_uri=<that request_uri>`}
      />
    </Section>
  );
}

export function ConfidentialSecrets() {
  return (
    <Section id="secrets" title="Confidential clients and their secrets">
      <ul className="article__list">
        <li>
          A confidential client authenticates with HTTP Basic auth (<C>client_secret_basic</C>): its
          client ID and secret in the <C>Authorization</C> header, at the token, PAR, revocation and
          introspection endpoints.
        </li>
        <li>
          The server keeps only a hash. Nobody, admins included, can read a secret back: it's shown
          once, when it's made.
        </li>
        <li>
          Lost or leaked? <strong>Rotate secret</strong> in the client's menu. The old one stops
          working at once, so update the app straight after.
        </li>
        <li>
          Keep it with the app's other secrets (a secret manager, a Kubernetes Secret), never in its
          code or in a browser bundle. An app that can't keep a secret is a public client.
        </li>
      </ul>
      <Alert intent="warning">
        <AlertTitle>A service has no redirect URI</AlertTitle>
        <AlertDescription>
          A <C>machine</C> client only uses client credentials, within the scopes it was given; it
          can't sign anyone in. A web client can't use client credentials.
        </AlertDescription>
      </Alert>
    </Section>
  );
}
