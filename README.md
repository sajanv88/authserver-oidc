# auth-server

An OpenID Connect provider for your own apps: sign-up and sign-in (password, magic link, two-factor), a consent screen, admin-managed OIDC clients, and a session that can be shared across subdomains. Built with Next.js 16, [Better Auth](https://www.better-auth.com) with its OAuth provider plugin, PostgreSQL 17 through Drizzle, and the nuvui component library, in a pnpm + Turborepo monorepo. It ships as one Docker image and a Helm chart for Argo CD.

```
apps/auth-server/      the provider (Next.js): sign-in pages, consent, /admin/clients, /account/security
apps/example-client/   a demo app on :3001 that uses both the shared cookie and OIDC
packages/db/           schema, migrations, query functions, the bundled migrator
charts/auth-server/    Helm chart (Deployment, ConfigMap, migrate Job as an Argo CD PreSync hook)
.github/workflows/     pr.yaml, main.yaml, release.yaml
```

## Run it locally

You need Node 26 (the exact version is in `.node-version`) and pnpm (the version is pinned in `package.json`; pnpm fetches it itself).

1. **A database.** Any Postgres 17 works. With Docker: `docker compose up -d` starts one on `127.0.0.1:5432` (user, password `app`, database `auth-server`). Without Docker, point `DATABASE_URL` at a database you have.
2. **Configuration.** `cp .env.example .env`, then fill in at least:
   - `DATABASE_URL`
   - `BETTER_AUTH_SECRET`: `openssl rand -base64 32`
   - `SEED_ADMIN_PASSWORD`: 12+ characters, for the admin the seed creates
   - `EXAMPLE_SESSION_SECRET`: `openssl rand -base64 32`, for the example app's cookies

   The defaults use `EMAIL_PROVIDER=console`: emails (confirmation links, magic links, resets) are printed in the server's log instead of sent.
3. **Install and migrate.** `pnpm install`, then `pnpm db:migrate`.
4. **Seed.** `pnpm db:seed` creates a confirmed admin (`SEED_ADMIN_EMAIL`, default `admin@localtest.me`) and registers the example app as a public OIDC client. It prints the client ID: put it in `.env` as `EXAMPLE_CLIENT_ID`. Running it again changes nothing.
5. **Start.** `pnpm dev` runs both apps:
   - the auth server at <http://auth.localtest.me:3000>
   - the example app at <http://app.localtest.me:3001>

### Local domains

`*.localtest.me` resolves to `127.0.0.1` through public DNS, so no hosts-file changes are needed. The two apps use different subdomains of one parent, like production would:

| | |
|---|---|
| Auth server, also the OIDC issuer | `http://auth.localtest.me:3000` (`BETTER_AUTH_URL`) |
| Example app | `http://app.localtest.me:3001` (in `TRUSTED_ORIGINS`) |
| Shared session cookie domain | `.localtest.me` (`COOKIE_DOMAIN`) |

Plain `http://` redirect URIs are accepted only for `*.localtest.me`, and only in development. Production requires https everywhere.

### Checks

```sh
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

The tests drive the real Better Auth configuration over HTTP against an in-memory Postgres (PGlite): no database or network needed.
