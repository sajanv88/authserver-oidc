# nextidp

Sign people in to your Next.js app with [authserver-oidc](https://github.com/sajanv88/authserver-oidc)
in one call. It does the OpenID Connect work for you:

- the authorization code flow with PKCE;
- the ID token's checks (signature, issuer, audience, expiry, nonce);
- an encrypted session cookie, so no database is needed;
- refreshing tokens before they expire;
- signing out, of your app or of the auth server too.

It works with any OpenID Connect provider that supports the code flow with PKCE, but it's
made for, and tested against, authserver-oidc.

```sh
npm i nextidp
```

ES module and CommonJS builds, with types. Node 20.19 or later. Next.js 15 or 16 (App
Router).

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

## Coming next

- **Protecting an API:** checking access tokens and scopes in NestJS, Express and Next.js
  route handlers.
- **Express and Node** sign-in, for apps that render their own pages.
- **Service-to-service tokens** (client credentials).
- **A session store**, so the auth server can end an app's sessions (back-channel logout).

## License

MIT
