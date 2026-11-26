# nextidp

Sign people in to your Next.js, Express or Node app, and protect your APIs, with
[authserver-oidc](https://github.com/sajanv88/authserver-oidc), in one call. It does the
OpenID Connect work for you:

- the authorization code flow with PKCE;
- the ID token's checks (signature, issuer, audience, expiry, nonce);
- an encrypted session cookie, so no database is needed;
- refreshing tokens before they expire;
- signing out, of your app or of the auth server too;
- checking the access tokens your API is called with, and their scopes, in NestJS, Express
  or a Next.js route handler ([below](#protecting-an-api));
- tokens for a service to call other APIs as itself ([below](#calling-an-api-as-a-service)).

It works with any OpenID Connect provider that supports the code flow with PKCE, but it's
made for, and tested against, authserver-oidc.

```sh
npm i nextidp
```

ES module and CommonJS builds, with types. Node 24 or later. Next.js 15 or 16 (App
Router), Express (tested with 5) or anything else that takes Node middleware, Node's own
HTTP server, and NestJS 11 or 12 for APIs.

## 1. Register your app on the auth server

In the auth server's **Admin → OIDC clients**, create a client (or declare it in
`clients:provision`):

- **Redirect URI:** `https://app.example.com/auth/callback`
- **Post-logout redirect URI:** `https://app.example.com/`, only if you want "sign out of the
  auth server too" (through `clients:provision`)
- **Public** (PKCE only, no secret), or **confidential** if your app should keep a secret.

## 2. Settings

Put these in your app's environment:

```sh
IDP_ISSUER=https://auth.example.com        # the auth server
IDP_CLIENT_ID=…                            # from step 1
IDP_CLIENT_SECRET=…                        # confidential clients only
IDP_APP_URL=https://app.example.com        # this app's origin
IDP_SECRET=…                               # ≥ 32 characters: openssl rand -base64 32
```

## 3. Wire it up

In a Next.js app (for Express or Node's own server, see [below](#express-or-node)):

```ts
// src/auth.ts
import { idp } from "nextidp/next";

export const auth = idp(); // reads IDP_* on first use, so `next build` needs none of them
```

```ts
// src/app/auth/[...nextidp]/route.ts
import { auth } from "@/auth";

export const { GET, POST } = auth.routes();
```

```ts
// src/proxy.ts (middleware.ts before Next.js 16)
import { auth } from "@/auth";

// Sends signed-out visitors of /dashboard to sign in, and refreshes tokens before they expire.
export const proxy = auth.proxy({ protect: ["/dashboard"] });

export const config = { matcher: ["/((?!auth/|_next/|favicon.ico).*)"] };
```

That's all. Now use the session:

```tsx
// src/app/dashboard/page.tsx
import { auth } from "@/auth";

export default async function Dashboard() {
  const session = await auth.requireSession("/dashboard"); // or auth.session(): null if signed out
  return <h1>Hello, {session.user.name ?? session.user.email}</h1>;
}
```

```tsx
// Signing in and out: plain links and forms to nextidp's routes
<a href="/auth/login?returnTo=/dashboard">Sign in</a>

<form method="post" action="/auth/logout">
  <button type="submit">Sign out</button>
  <button type="submit" name="signOutOfIdp" value="true">Sign out everywhere</button>
</form>
```

Calling an API as the signed-in person:

```ts
const session = await auth.session();
await fetch("https://api.example.com/orders", {
  headers: { authorization: `Bearer ${session?.accessToken}` },
});
```

## Express or Node

The same settings, the same routes. With **Express**:

```ts
import express from "express";
import { idp } from "nextidp/express";

const auth = idp(); // the IDP_* settings, read on first use
const app = express();

// Before your routes: answers nextidp's routes, and reads the session (refreshing it
// before it expires) for every other request.
app.use(auth.express());

app.get("/", (req, res) => {
  const session = auth.sessionOf(req); // null if signed out
  res.send(session ? `Hello, ${session.user.name}` : `<a href="/auth/login">Sign in</a>`);
});

// Signed out, a GET goes to sign in and comes back; anything else gets 401.
app.get("/dashboard", auth.requireSession(), (req, res) => {
  res.render("dashboard", { user: auth.sessionOf(req)?.user });
});
```

A body parser before it is fine: the sign-out form is read from what it parsed.

With **Node's own HTTP server**:

```ts
import { createServer } from "node:http";
import { idp } from "nextidp/node";

const auth = idp();

createServer(async (req, res) => {
  if (await auth.handle(req, res)) return;             // nextidp's routes
  const session = await auth.requireSession(req, res); // or auth.session(req, res): null if signed out
  if (!session) return;                                // sent to sign in
  res.end(`Hello, ${session.user.name}`);
}).listen(3000);
```

Read the session before you start the response: a refresh sets a new cookie. Read twice in
one request, it's refreshed once.

## The routes

All under `basePath` (default `/auth`):

| Route | What it does |
|---|---|
| `GET /auth/login?returnTo=/path` | Starts a sign-in, and comes back to `returnTo` (paths of this app only). |
| `GET /auth/callback` | Finishes it: the redirect URI you registered. |
| `POST /auth/logout` | Revokes the refresh token and ends this app's session. With `signOutOfIdp=true`, the auth server's too. |
| `POST /auth/refresh` | New tokens now, then back to the form's `returnTo`. |

The POST routes accept forms from this app's own pages only (they check `Origin`).

## The session

```ts
type Session = {
  user: { id: string; email?: string; emailVerified?: boolean; name?: string; picture?: string };
  claims: JWTPayload;           // every claim of the ID token, checked
  accessToken: string;          // for APIs: Authorization: Bearer …
  accessTokenExpiresAt: number; // seconds since the epoch
  scope: string | undefined;
  canRefresh: boolean;          // offline_access was granted
};
```

The refresh token and the ID token stay inside the encrypted cookie: nothing in the browser
can read them.

## All the settings

Pass them to `idp({...})`, or set the variable in brackets. A function works too,
`idp(() => ({...}))`, called on first use.

| Option | Default | |
|---|---|---|
| `issuer` (IDP_ISSUER) | | The auth server's URL. |
| `clientId` (IDP_CLIENT_ID) | | |
| `clientSecret` (IDP_CLIENT_SECRET) | none: a public client | Sent with HTTP Basic. |
| `appUrl` (IDP_APP_URL) | | This app's origin. |
| `secret` (IDP_SECRET) | | At least 32 characters. A list rotates it: the first encrypts, all decrypt (comma-separated in the variable). |
| `scopes` (IDP_SCOPES) | `openid profile email offline_access` | `offline_access` gets a refresh token. |
| `resource` (IDP_RESOURCE) | none | An API's URI (RFC 8707): the access token is then a JWT for it. |
| `audience` (IDP_AUDIENCE) | none: required to check tokens | For an API: its own URI, exactly as in the auth server's `OAUTH_RESOURCES`. Every token must name it. Never taken from `resource`, which is the API an app asks tokens *for*. |
| `acceptOwnTokens` | `false` | For an API: also accept an opaque token issued to its own `clientId` that doesn't name `audience`. |
| `basePath` | `/auth` | Where the routes live. |
| `afterSignIn` | `/` | Where a sign-in lands without a `returnTo`. |
| `afterSignOut` | `/` | Where sign-out lands: also the post-logout redirect URI. |
| `errorPath` | `/` | Where a failed sign-in lands, with `?error=<code>`. |
| `signOutOfIdp` | `false` | Sign out of the auth server too, unless the form says otherwise. |
| `sessionMaxAge` | 7 days | Renewed at every refresh. |
| `cookiePrefix` | `nextidp` | Cookies are `__Host-nextidp.session` on https. |
| `onError` | one `console.error` line | Told about every failure. Messages never hold tokens or claims. |

Anything missing or wrong is reported on the first request, with every setting named, in
`IdpError` with the code `misconfigured`.

## When a sign-in fails

The browser goes to `errorPath?error=<code>`, so your page can explain:

| Code | Meaning |
|---|---|
| `access_denied` | The person chose Deny. |
| `expired` | The sign-in took more than 10 minutes, or its cookie was lost. |
| `state_mismatch` | The answer wasn't for a sign-in this browser started. |
| `token_failed` | The auth server refused the code. |
| `invalid_id_token` | The ID token's signature, issuer, audience, expiry or nonce was wrong. |
| `refresh_failed` | The refresh token was refused. |

```ts
import { isSignInErrorCode } from "nextidp/next";

if (isSignInErrorCode(searchParams.error)) { /* … */ }
```

## Protecting an API

An API needs two settings: the auth server, and its own URI as the auth server lists it
in `OAUTH_RESOURCES`.

```sh
IDP_ISSUER=https://auth.example.com
IDP_AUDIENCE=https://api.example.com   # exactly as in OAUTH_RESOURCES
```

The apps that call it ask for tokens with `resource` set to that URI, and must be linked to
it on the auth server (`clients:provision`'s `resources`). Their access tokens are then JWTs
for this API: nextidp checks each one against the auth server's published keys (signature,
`typ` at+jwt, required, so no other kind of JWT passes for one; issuer, audience, expiry) and the scopes the route needs, with no call to the
auth server per request.

**NestJS** (11 or 12):

```ts
import { CurrentToken, IdpModule, Public, Scopes, type AccessToken } from "nextidp/nestjs";

@Module({ imports: [IdpModule.forRoot()] }) // reads IDP_*; or forRoot({ issuer, audience })
export class AppModule {}

@Controller("orders")
@Scopes("orders:read")                       // every route here needs it
export class OrdersController {
  @Get()
  list(@CurrentToken() token: AccessToken) {
    return this.orders.of(token.subject);
  }

  @Post()
  @Scopes("orders:write")                    // and this one needs this too
  create() {}

  @Public()                                  // no token needed
  @Get("health")
  health() {}
}
```

The guard protects every route of the app by default; pass `{ protectAll: false }` and use
`@UseGuards(IdpGuard)` to pick routes yourself. With `ConfigService`:
`IdpModule.forRootAsync({ inject: [ConfigService], useFactory: (config) => ({ issuer: …, audience: … }) })`.

**Express** (or anything with Connect-style middleware):

```ts
import { idp } from "nextidp/express";

const auth = idp(); // IDP_ISSUER and IDP_AUDIENCE

app.get("/orders", auth.requireToken({ scopes: ["orders:read"] }), (req, res) => {
  res.json(ordersOf(auth.tokenOf(req)?.subject));
});
```

**A Next.js route handler:**

```ts
// src/app/api/orders/route.ts
export const GET = auth.withToken({ scopes: ["orders:read"] }, async (request, { token }) =>
  Response.json(await ordersOf(token.subject)),
);
```

A refused call gets 401 (no token, or a bad one) or 403 (a scope missing), with the
`WWW-Authenticate` challenge of RFC 6750. If the token can't be checked at all (the auth
server is down), the answer is 503, never a pass. The checked token:

```ts
type AccessToken = {
  subject: string | undefined;  // the person, or for a service its client ID
  clientId: string | undefined; // the app the token was issued to
  isService: boolean;           // client credentials: no person involved
  scopes: string[];
  audience: string[];
  expiresAt: number | undefined;
  claims: Record<string, unknown>;
};
```

**Opaque tokens.** A token asked for without `resource` isn't a JWT, and only introspection
can check it. Pass the API's own `clientId` and `clientSecret` (a confidential client) for
that. The auth server answers only for tokens this client was issued, or tokens for an API
it's linked to, and nextidp still requires the token to name `audience`: a token this client
was issued for something else passes only with `acceptOwnTokens: true`. Answers are kept
for a minute at most, so a revoked token is refused within a minute. For APIs, prefer JWTs:
ask for tokens with `resource`.

## Calling an API as a service

A service that calls another API as itself, with no person involved, gets its own tokens
(the client credentials grant). It needs a **machine** client on the auth server (in
`clients:provision`: `"type": "machine"`, with the `scopes` it may ask for and the
`resources` it may call), and its credentials:

```sh
IDP_ISSUER=https://auth.example.com
IDP_CLIENT_ID=…
IDP_CLIENT_SECRET=…
IDP_RESOURCE=https://orders.example.com   # optional: the API, when a call names none
```

```ts
import { idp } from "nextidp"; // or nextidp/express, nextidp/node, nextidp/next

const auth = idp();

const token = await auth.serviceToken({
  scopes: ["orders:read"],
  resource: "https://orders.example.com",
});
await fetch("https://orders.example.com/orders", {
  headers: { authorization: `Bearer ${token}` },
});
```

A token is kept until a minute before it expires (half its life, if that's shorter), one per
scopes and API, and calls at the same time share one request to the auth server. If an API
refuses one (401), `auth.dropServiceToken(token)` forgets it. With
[fast-http-client](https://www.npmjs.com/package/fast-http-client), that's done for you:

```ts
import { createHttp } from "fast-http-client";

const orders = createHttp({ baseUrl: "https://orders.example.com" });
auth.useServiceToken(orders, { scopes: ["orders:read"], resource: "https://orders.example.com" });

const { data } = await orders.get("/orders"); // with the token; a 401 gets a new one, once
```

In **NestJS**, inject the instance `IdpModule` holds (with `{ protectAll: false }` if the app
doesn't check tokens itself):

```ts
import { Inject, Injectable } from "@nestjs/common";
import { IDP, type Idp } from "nextidp/nestjs";

@Injectable()
export class OrdersClient {
  constructor(@Inject(IDP) private readonly auth: Idp) {}

  async list() {
    const token = await this.auth.serviceToken({ scopes: ["orders:read"] });
    // …
  }
}
```

A refusal throws `IdpError` with the code `service_token_failed` and the auth server's
status (`invalid_scope` for a scope the client may not have, `invalid_target` for an API it
isn't linked to).

## Coming next

- **A session store**, so the auth server can end an app's sessions (back-channel logout).

## License

MIT
