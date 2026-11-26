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

## 0.0.1

The name, reserved.
