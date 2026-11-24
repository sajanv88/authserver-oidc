# auth-server

A self-hosted sign-in server for your own apps. People create one account and use it to sign in to every app you connect, using standard **OpenID Connect** (OIDC).

What you get:

- **Sign-in:** sign-up with email confirmation, password sign-in, magic links, password reset
- **Social sign-in (optional):** Google, Microsoft, GitHub, and any OpenID Connect provider (Okta, Keycloak, Auth0…), each on when its keys are set
- **Two-factor authentication:** an authenticator app, with backup codes
- **Account security:** change your password, see where you're signed in, sign out one device or all of them
- **OpenID Connect:** authorization code with PKCE, refresh tokens, a consent screen, and an admin page to register apps (OIDC clients)
- **Your own APIs (optional):** JWT access tokens for an API (RFC 8707 resource indicators), API scopes, client credentials for services, back-channel logout, and a script that registers your apps from a file
- **Shared session:** one sign-in, shared across your subdomains
- **Bot protection (optional):** Cloudflare Turnstile on every form, checked on the server
- **Rate limits** on sign-in, sign-up and every email, per client IP
- **Themes:** light, dark or system, five color themes, and moving gradient backgrounds on the sign-in pages
- **Tested:** unit tests, and end-to-end BDD scenarios in Chromium every second day
- **Deploy:** a Docker image and a Helm chart

Built with Next.js 16, [Better Auth](https://www.better-auth.com), PostgreSQL and the nuvui component library.

## What you need

**To run it locally**

- Node.js 26 and pnpm
- A PostgreSQL 17 database (any; `docker compose up -d` starts one)

**To deploy it**

- A Kubernetes cluster (the Helm chart is made for Argo CD)
- A managed PostgreSQL database
- An SMTP account to send emails
- A domain with HTTPS, e.g. `auth.example.com`

## Run it locally

```sh
cp .env.example .env      # then fill in DATABASE_URL, BETTER_AUTH_SECRET and SEED_ADMIN_PASSWORD
pnpm install
pnpm db:migrate           # create the tables
pnpm db:seed              # an admin user, and the example app registered as a client
pnpm dev
```

- Auth server: <http://auth.localtest.me:3000> (`*.localtest.me` always points to your own machine)
- Example app: <http://app.localtest.me:3001> (in `.env`, set `EXAMPLE_CLIENT_ID` to the ID that `db:seed` prints, and `EXAMPLE_SESSION_SECRET` to `openssl rand -base64 32`)

Emails are printed in the terminal instead of being sent. Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. End-to-end: `pnpm test:e2e` (see [apps/tests](apps/tests/README.md)).

The project's landing page is `apps/landing`: a static site (<http://localhost:3002> under `pnpm dev`), published at <https://sajanv88.github.io/authserver-oidc/> by `.github/workflows/pages.yaml` on every change to it on `main`.

## Connect an app

1. Sign in as an admin and open **/admin/clients**. Add your app and its redirect URI.
2. Point your app's OIDC library at the issuer `https://auth.example.com`. Everything else comes from `https://auth.example.com/.well-known/openid-configuration`.
3. Use the authorization code flow with PKCE. Scopes: `openid`, `profile`, `email`, and `offline_access` for a refresh token.

`apps/example-client` is a small working example.

### Tokens for your own APIs

1. List your APIs and their scopes in `OAUTH_RESOURCES` (e.g. `https://api.example.com`) and `OAUTH_API_SCOPES` (e.g. `crm,booking`).
2. Declare the apps in a JSON file, like `apps/auth-server/scripts/clients.example.json`:
   - `web` apps sign people in. `firstParty` skips the consent screen; use it only for your own apps. `backchannelLogoutUri` (https) is told when someone's session ends, so signing out of one app signs them out of all of them.
   - `machine` clients are services that call an API as themselves, with client credentials.
3. Run `pnpm clients:provision <file>` with `PROVISION_ADMIN_EMAIL` set to an admin. It creates what's missing and updates the rest. It prints each new secret once, so store it right away. Run it again whenever the file changes.
4. Apps add `resource=https://api.example.com` to the authorization and token requests. The access token is then a JWT with `aud` set to the API, which the API verifies against `/jwks`. An app gets a token only for APIs it's linked to in the file. Apps that need back-channel logout ask for `offline_access`: the server tells the apps that hold a refresh token for the session that ended.

Apps on the same parent domain can also read the shared session cookie instead of using OIDC. Only do this for apps you fully trust: every subdomain receives that cookie.

## Deploy

1. Every merge to `main` publishes the image `ghcr.io/sajanv88/auth-server`. A tag `vX.Y.Z` publishes a release and the Helm chart `oci://ghcr.io/sajanv88/charts/auth-server`.
2. Create a Secret in your namespace with `BETTER_AUTH_SECRET`, `DATABASE_URL` and `SMTP_PASSWORD`. The chart reads it but never creates it.
   Keep `BETTER_AUTH_SECRET` the same for everything that uses the database: it encrypts the token-signing key stored there, and with another secret apps can't get tokens (the token endpoint answers 500). To change it, also delete the rows of the `jwks` table; a new key is made, and apps verify against it from `/jwks`.
3. In `charts/auth-server/values-production.yaml`, set your domain and SMTP host and user.
   Optional: for Cloudflare Turnstile on the forms, set `TURNSTILE_SITE_KEY` there and add `TURNSTILE_SECRET_KEY` to the Secret.
   Optional: to rename the product, set `APP_NAME` there (it's "Auth Server" otherwise): it's shown on every page, in titles, emails and authenticator apps.
   Optional: for your logo instead of the shield, on the sign-in pages and in the signed-in pages' top bar, set `LOGO_URL` there to a full https URL. A square image looks best; it's shown at 32 px on the sign-in pages and 28 px in the top bar.
   Optional: for tokens for your own APIs, set `OAUTH_RESOURCES` and `OAUTH_API_SCOPES` there, then run `pnpm clients:provision` with that environment's settings (see [Tokens for your own APIs](#tokens-for-your-own-apis)).
   Optional: for social sign-in, set a provider's client ID there (`GOOGLE_CLIENT_ID`, `MICROSOFT_CLIENT_ID`, `GITHUB_CLIENT_ID`, or `SSO_NAME`, `SSO_DISCOVERY_URL` and `SSO_CLIENT_ID`) and its secret in the Secret. Register `https://auth.example.com/api/auth/callback/<google | microsoft | github | sso>` as the redirect URI with the provider.
4. Sync the chart with Argo CD. Database migrations run automatically before each rollout.

## License

[MIT](LICENSE)
