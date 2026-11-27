# Changelog

## Unreleased

### Sign-in

- `GET <basePath>/login?prompt=…` passes `prompt` on to the auth server: `login`, `consent`
  or `select_account`, or several separated by spaces. Any other value, `none` included, is
  left out, and nothing else in the query is passed on. `signInPath(returnTo, { prompt })`
  builds the link.
- `reauthenticateAfterSignOut` (default `false`): a sign-out leaves a small marker cookie
  (`<prefix>.signed-out`, `__Secure-` on https, on `basePath` only, 30 days), and the next
  sign-in sends `prompt=login` and clears it, so a shared computer doesn't sign the next person
  in as the last. A link with `reauthenticate=false` (a "Create account" link) opts out and
  leaves the marker; a `prompt` in the link wins over it.
- `userinfo` (default `false`): the email, `email_verified`, name and picture from the
  userinfo endpoint, merged into `session.user` after sign-in and after a refresh that brings
  a new ID token (kept otherwise), for auth servers that leave them out of the ID token.
  Best effort: a failure, or an answer about another `sub`, goes to `onError` and the
  sign-in goes ahead. `session.claims` stays the ID token's.

### Next.js

- `routes()` answers a fetch of the login route by Next's client router (a `<Link>`,
  `router.push` or a prefetch: the `rsc` header) with a 200 "Sign-in needs a full page load."
  and no cookie, instead of a redirect it can't follow. The router then loads it as a whole
  page, and a sign-in under way keeps its flow cookie.

## 0.1.3

### Hono, and edge runtimes

- `nextidp/hono`: `routes()`, `middleware()` (the session as `c.get("session")`, refreshed
  before it expires), `requireSession()` and `requireToken()` (the token as
  `c.get("token")`), with the `IdpEnv` type for `new Hono<IdpEnv>()`. A refreshed cookie
  reaches any response the handler makes, its own `Response` included.
- Runs on edge runtimes (Cloudflare Workers, Vercel Edge, Deno, Bun): the tests bundle the
  core and the Hono adapter for a platform without Node built-ins and run them in Cloudflare's
  `workerd`, with no Node compatibility: sign-in, refresh, sign-out, back-channel logout,
  API tokens and service tokens.

## 0.1.2

The first release with code in it: sign-in for Next.js, Express and Node, API protection
for NestJS, Express and Next.js, service tokens, and sessions in a store with back-channel
logout.

### Sign-in for Next.js (App Router)

- `idp()` from `nextidp/next`: `routes()`, `proxy()`, `session()`, `requireSession()`.
- The core from `nextidp`, without a framework: `handler()`, `getSession()`,
  `refreshIfNeeded()`, `userInfo()`, `signInPath()`.
- The authorization code flow with PKCE (S256), the state and nonce checked, and the ID token
  verified (signature, `iss`, `aud`, `azp`, `exp`, `iat`, nonce).
- The session in an encrypted cookie (A256GCM, a key per purpose from HKDF), split when it's
  over 4 KB, with secret rotation.
- Refresh before expiry in the proxy, shared between concurrent requests. Sign-out revokes
  the refresh token, and can end the auth server's session too (RP-initiated logout).
- ES module and CommonJS builds, with types for each.

### Sign-in for Express and Node

- `nextidp/express`: `express()` middleware (nextidp's routes, and the session read and
  refreshed on every other request), `requireSession()` and `sessionOf(req)`.
- `nextidp/node` for Node's own HTTP server: `handle(req, res)`, `session(req, res)` and
  `requireSession(req, res)`.
- A signed-out GET goes to sign in and comes back after; anything else gets 401.
- The URL is always on `appUrl`'s origin, never from the Host header. Forms a body parser
  already read are taken from it; others are read up to 64 KB (413 past that).
- A refresh happens only while the response's headers can still be set, so a rotated refresh
  token is never lost.

### Sessions in a store, and back-channel logout

- The `store` option (`SessionStore`: `get`, `set`, `delete` over strings), and
  `memoryStore()` for one process. The cookie then holds only a sealed reference, and the
  stored session is sealed too.
- Signing out deletes the stored session, so a copy of the old cookie is signed out as well.
  A new sign-in replaces the browser's previous session.
- `POST <basePath>/backchannel-logout` (OIDC Back-Channel Logout 1.0), with a store only:
  the logout token is checked (signature, `iss`, `aud`, `iat`, `exp`, the logout event, a
  `sid` or `sub`, no `nonce`, `typ` logout+jwt when there is one), then the app's sessions
  from that auth-server session end; a token with only `sub` ends all of the person's
  sessions begun before it. 400 for a token that doesn't verify (`invalid_logout_token`).
- A refresh refused because another instance sharing the store refreshed first keeps the
  session that instance stored.
- Apps sharing a store are kept apart by their client ID.

### Service tokens

- `serviceToken({ scopes, resource })` in the core: a service's own access token (client
  credentials, a confidential client), kept until a minute before it expires (half its life
  if that's shorter), per scopes and API, with one request at a time.
- `dropServiceToken(token)` forgets one an API refused. `useServiceToken(client, options)`
  puts tokens on the requests of a fast-http-client client to the API's origin (that of
  `resource`, or `origins`) and nowhere else, and on a 401 gets a new one and sends the
  request once more.
- A refusal is `IdpError` with the code `service_token_failed`, and isn't kept.
- NestJS: inject `IDP` and call `serviceToken()`.

### Protecting an API

- `verifyAccessToken()` and `verifyBearer()` in the core: a JWT access token checked against
  the issuer's keys (signature, `typ` at+jwt, `iss`, `aud`, expiry), an opaque one by
  introspection (kept a minute at most), then the scopes a route needs.
- 401 and 403 with RFC 6750's `WWW-Authenticate` challenge (`tokenErrorResponse()`), 503
  when a token can't be checked at all.
- `nextidp/nestjs`: `IdpModule.forRoot()` and `forRootAsync()`, a guard on every route by
  default, `@Scopes()`, `@Public()`, `@CurrentToken()`. NestJS 11 (CommonJS) and 12 (ES
  modules).
- `nextidp/express`: `requireToken()` middleware and `tokenOf(req)`.
- `nextidp/next`: `withToken()` for route handlers.
- An API needs only `issuer` and `audience` (IDP_AUDIENCE), required and never taken from
  `resource`. A JWT access token must have `typ` at+jwt. An introspected token must name the
  audience too, unless `acceptOwnTokens` lets this client's own tokens through.
- Nothing from the HTTP client reaches an error or a log: a failed request keeps only its
  message, and the adapters log error codes.
- `resource` and `audience` are kept exactly as written: the auth server compares them as
  strings.
- Node 24 or later.

## 0.0.1

The name, reserved.
