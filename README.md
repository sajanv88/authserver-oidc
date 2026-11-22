# auth-server

A self-hosted sign-in server for your own apps. People create one account and use it to sign in to every app you connect, using standard **OpenID Connect** (OIDC).

What you get:

- Sign-up with email confirmation, password sign-in, magic links, password reset
- Two-factor authentication (authenticator app + backup codes)
- A consent screen, and an admin page to register apps (OIDC clients)
- A session that can be shared across your subdomains
- A Docker image and a Helm chart to deploy it

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

Emails are printed in the terminal instead of being sent. Checks: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Connect an app

1. Sign in as an admin and open **/admin/clients**. Add your app and its redirect URI.
2. Point your app's OIDC library at the issuer `https://auth.example.com`. Everything else comes from `https://auth.example.com/.well-known/openid-configuration`.
3. Use the authorization code flow with PKCE. Scopes: `openid`, `profile`, `email`, and `offline_access` for a refresh token.

`apps/example-client` is a small working example.

Apps on the same parent domain can also read the shared session cookie instead of using OIDC. Only do this for apps you fully trust: every subdomain receives that cookie.

## Deploy

1. Every merge to `main` publishes the image `ghcr.io/sajanv88/auth-server`. A tag `vX.Y.Z` publishes a release and the Helm chart `oci://ghcr.io/sajanv88/charts/auth-server`.
2. Create a Secret in your namespace with `BETTER_AUTH_SECRET`, `DATABASE_URL` and `SMTP_PASSWORD`. The chart reads it but never creates it.
3. In `charts/auth-server/values-production.yaml`, set your domain and SMTP host and user.
   Optional: for Cloudflare Turnstile on the forms, set `TURNSTILE_SITE_KEY` there and add `TURNSTILE_SECRET_KEY` to the Secret.
4. Sync the chart with Argo CD. Database migrations run automatically before each rollout.

## License

[MIT](LICENSE)
