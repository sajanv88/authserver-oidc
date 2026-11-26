# Changelog

## Unreleased

Released once the whole planned scope is in: sign-in for Next.js, API protection, Express
and Node sign-in, service tokens and a session store. The heading becomes the version then
(`nextidp-release.yaml` takes the release notes from it).

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
