import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@nuvui/table/table";
import { repo } from "@/content/site";
import { Code } from "../code/code";
import "./connect.scss";

const SNIPPETS = [
  {
    value: "settings",
    name: "Settings",
    about:
      "Register the app in /admin/clients with its redirect URI. Most libraries need only these: the rest comes from discovery.",
    title: ".env",
    language: "dotenv",
    code: `OIDC_ISSUER=https://auth.example.com
OIDC_CLIENT_ID=your-client-id
# Empty for a public client: PKCE only
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=https://app.example.com/oidc/callback
OIDC_SCOPES="openid profile email offline_access"`,
  },
  {
    value: "authorize",
    name: "Authorize",
    about:
      "Send the user to the authorization endpoint. Keep the state, the nonce and the PKCE verifier, encrypted, until they come back.",
    title: "Redirect",
    language: "http",
    code: `GET https://auth.example.com/api/auth/oauth2/authorize
  ?response_type=code
  &client_id=your-client-id
  &redirect_uri=https%3A%2F%2Fapp.example.com%2Foidc%2Fcallback
  &scope=openid%20profile%20email%20offline_access
  &state=RANDOM_STATE
  &nonce=RANDOM_NONCE
  &code_challenge=BASE64URL_SHA256_OF_THE_VERIFIER
  &code_challenge_method=S256`,
  },
  {
    value: "token",
    name: "Token",
    about:
      "Back at your redirect URI, check the state, then swap the code. A confidential client authenticates with Basic auth.",
    title: "Terminal",
    language: "sh",
    code: `curl -X POST https://auth.example.com/api/auth/oauth2/token \\
  -d grant_type=authorization_code \\
  -d code=CODE_FROM_THE_CALLBACK \\
  -d redirect_uri=https://app.example.com/oidc/callback \\
  -d client_id=your-client-id \\
  -d code_verifier=YOUR_PKCE_VERIFIER`,
  },
  {
    value: "verify",
    name: "Verify",
    about:
      "Verify the ID token against the published keys before you trust a word of it, and check it carries your nonce.",
    title: "verify-id-token.ts",
    language: "ts",
    code: `import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.example.com";
const keys = createRemoteJWKSet(new URL("/jwks", issuer));

export async function verifyIdToken(idToken: string, nonce: string) {
  const { payload } = await jwtVerify(idToken, keys, {
    issuer,
    audience: process.env.OIDC_CLIENT_ID,
    algorithms: ["RS256"],
  });
  if (payload.nonce !== nonce) throw new Error("The ID token is for another sign-in");
  return payload; // sub, email, email_verified, name, picture
}`,
  },
];

const ENDPOINTS = [
  {
    method: "GET",
    path: "/.well-known/openid-configuration",
    what: "Discovery: every endpoint below, for your library",
  },
  { method: "GET", path: "/jwks", what: "The public keys ID tokens are signed with (RS256)" },
  { method: "GET", path: "/api/auth/oauth2/authorize", what: "Starts a sign-in: code + PKCE S256" },
  { method: "POST", path: "/api/auth/oauth2/token", what: "A code or a refresh token for tokens" },
  { method: "GET", path: "/api/auth/oauth2/userinfo", what: "The signed-in user's claims" },
  { method: "POST", path: "/api/auth/oauth2/revoke", what: "Revokes a token, on sign-out" },
  { method: "POST", path: "/api/auth/oauth2/introspect", what: "Whether a token is still active" },
];

export function Connect() {
  return (
    <section className="section" id="connect" aria-labelledby="connect-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Connect an app</p>
          <h2 className="section__title" id="connect-title">
            Four snippets from zero to a signed-in user
          </h2>
          <p className="section__lead">
            Use your framework's OIDC library, or follow these by hand. The{" "}
            <a className="connect__link" href={repo("tree/main/apps/example-client")}>
              example client
            </a>{" "}
            does all of it in a few hundred lines, refresh and sign-out included.
          </p>
        </div>
        <div className="connect">
          <Tabs defaultValue="settings" className="connect__tabs">
            <TabsList aria-label="Steps to connect an app">
              {SNIPPETS.map((snippet, index) => (
                <TabsTrigger key={snippet.value} value={snippet.value}>
                  {index + 1}. {snippet.name}
                </TabsTrigger>
              ))}
            </TabsList>
            {SNIPPETS.map((snippet) => (
              <TabsContent key={snippet.value} value={snippet.value} className="connect__panel">
                <p className="connect__about">{snippet.about}</p>
                <Code
                  code={snippet.code}
                  language={snippet.language}
                  title={snippet.title}
                  label={`${snippet.name} example`}
                />
              </TabsContent>
            ))}
          </Tabs>
          <div className="connect__reference">
            <h3 className="connect__heading" id="endpoints-title">
              Endpoints
            </h3>
            <p className="connect__about">
              Every path is on your issuer, such as <code>https://auth.example.com</code>.
            </p>
            <TableContainer aria-labelledby="endpoints-title">
              <Table aria-labelledby="endpoints-title">
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>What it's for</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ENDPOINTS.map((endpoint) => (
                    <TableRow key={endpoint.path}>
                      <TableCell rowHeader>
                        <span className="connect__endpoint">
                          <Badge
                            variant="outline"
                            intent={endpoint.method === "GET" ? "success" : "warning"}
                          >
                            {endpoint.method}
                          </Badge>
                          <code className="connect__path">{endpoint.path}</code>
                        </span>
                      </TableCell>
                      <TableCell>{endpoint.what}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </div>
        </div>
      </div>
    </section>
  );
}
