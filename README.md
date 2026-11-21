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

## Connecting an app with OIDC

Register the app in **/admin/clients** (admins only). Choose:

- **Public** for anything that runs in a browser or on a phone: no secret, PKCE proves the app.
- **Confidential** for an app with a server that can keep a secret. The secret is shown once and stored hashed; "Rotate secret" replaces it, and the old one stops working at once.

Then configure the app with:

| Setting | Value |
|---|---|
| Issuer | `https://auth.example.com` (exactly `BETTER_AUTH_URL`) |
| Discovery | `https://auth.example.com/.well-known/openid-configuration` |
| Keys (JWKS) | `https://auth.example.com/jwks` (RS256) |
| Authorization, token, userinfo | from discovery (under `/api/auth/oauth2/`) |
| Flow | authorization code with **PKCE S256**, required for every client |
| Grants | `authorization_code`, `refresh_token` |
| Client authentication | `none` (public) or `client_secret_basic` / `client_secret_post` |
| Scopes | `openid`, `profile`, `email`, `offline_access` (for a refresh token) |
| Redirect URIs | exact matches of what's registered; https (http only on loopback, or `*.localtest.me` in development) |

Token lifetimes:

| Token | Lifetime |
|---|---|
| Authorization code | 10 minutes, single use (a replayed code revokes what was issued with it) |
| Access token | 10 minutes |
| ID token | 10 minutes |
| Refresh token | 30 days, rotated on every use; reusing an old one is treated as theft and revokes the newer one too |

What your app must check, as `apps/example-client` does:

- the `state` it sent comes back unchanged;
- the ID token's signature against `/jwks`, and its `iss`, `aud` (your client ID), `exp` and `nonce`;
- email and profile claims come from **userinfo** (`/api/auth/oauth2/userinfo` with the access token), not from the ID token.

The first time someone signs in to an app they see a consent screen listing what it asked for; they can allow or deny (`error=access_denied` comes back to the app). Consent is remembered for the next time.

## Shared cookie or OIDC?

**The shared session cookie.** When `COOKIE_DOMAIN` is set, the auth server's session cookie is set on that parent domain, so every subdomain receives it. An app's server can forward it to `GET /api/auth/get-session` and learn who's signed in, with no redirects. Use it for your own first-party apps on the same parent domain that need to know "is this person signed in here?"

The caveat: **every subdomain of `COOKIE_DOMAIN` receives the session cookie**. Anything that can run code on any subdomain (a user-content host, a third-party service on a CNAME, a staging environment of lower trust) can read it and act as the user. Only put apps you fully trust under that domain, or leave `COOKIE_DOMAIN` empty to turn sharing off.

**OIDC.** The app gets its own tokens for exactly the scopes the person allowed, and keeps its own session. Use it for apps on other domains, third-party or less trusted apps, mobile and single-page apps, and anything that should be able to be revoked on its own. When in doubt, use OIDC.

## Security notes

- Sign-in, sign-up, resets, magic links, two-factor codes, password changes and the token endpoint are rate limited per client IP, with counts in the database so every replica shares them. Behind an ingress, set `TRUSTED_PROXIES` to the ingress pods so the real client IP is used.
- The same answer is given whether or not an email has an account (sign-up, reset, magic link).
- Emailed links are single use and short-lived (confirmation 1 hour, reset 15 minutes, magic link 5 minutes). A password reset signs out every session.
- Every page gets a nonce-based Content-Security-Policy; cookies are `HttpOnly`, `Secure` and `SameSite=Lax` in production (`__Secure-` prefixed).

## Delivery

| Event | Workflow | What happens |
|---|---|---|
| Pull request | `pr.yaml` | Biome, stylelint, typecheck and tests (`turbo --affected`), `pnpm audit`, build, Docker build and health check (read-only, no capabilities), `helm lint --strict` + kubeconform on both values files, and the migrator twice against Postgres 17. Publishes nothing. |
| Merge to `main` | `main.yaml` | Builds the image once (amd64 + arm64) with provenance and SBOM, and pushes `ghcr.io/sajanv88/auth-server:sha-<short>` and `:main`. |
| Tag `vX.Y.Z` | `release.yaml` | Checks the tag is on main, retags that commit's image as `:vX.Y.Z` and `:latest` without rebuilding, pushes the chart to `oci://ghcr.io/sajanv88/charts/auth-server` at `X.Y.Z`, and creates a GitHub Release with the chart, the image digest and the SBOM. |

Every action is pinned to a commit SHA; Dependabot updates them weekly.

### Releasing

1. Merge to `main`.
2. Wait for `main.yaml` to go green (the release needs that commit's image).
3. `git tag vX.Y.Z && git push origin vX.Y.Z`

Never edit `version` or `appVersion` in `Chart.yaml`: the release sets them. A bad release is fixed with a new patch tag, never by moving a tag.

## Production

The chart (`charts/auth-server`) runs the image with a read-only root filesystem as uid 1001, probes on `/api/health`, at least two replicas, spread across zones and nodes where the cluster allows, and an HPA and PDB. Layer the values: `-f values.yaml -f values-production.yaml`. In `values-production.yaml`, replace `example.com` with your domain and fill in `SMTP_HOST` and `SMTP_USER`: the app refuses to start without them.

**Configuration** goes in the chart's ConfigMap (`config:` in values): `BETTER_AUTH_URL`, `COOKIE_DOMAIN`, `TRUSTED_ORIGINS`, `TRUSTED_PROXIES`, `EMAIL_PROVIDER` (`smtp` in production), `EMAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`. The app validates all of it at startup and logs which variable is wrong, never its value.

**Secrets** go in one Secret that already exists in the namespace, named by `existingSecret` (default `auth-server-secrets`). The chart never creates it. Create it with External Secrets, Sealed Secrets or by hand, with three keys:

```sh
kubectl -n auth create secret generic auth-server-secrets \
  --from-literal=BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  --from-literal=DATABASE_URL='postgres://…?sslmode=verify-full' \
  --from-literal=SMTP_PASSWORD='…'
```

It must exist **before the first sync**: the migrations run first, and they need it.

**Argo CD.** Sync the chart from `oci://ghcr.io/sajanv88/charts` (a released version) or from `charts/auth-server` in git (then set `image.tag: sha-<short-sha>`). If the GHCR packages are private, the cluster needs a pull secret (`imagePullSecrets`, `ghcr-pull` in production values) and Argo CD needs repository credentials for the chart.

**Migrations** run as an Argo CD PreSync Job (`node packages/db/dist/migrate.mjs` from the same image) before the new pods roll out. If they fail, the sync fails and the old pods keep serving. They are **forward-only**: a bad migration is fixed by a new one, never by editing or reverting history. Keep each one compatible with the previous app version, which keeps serving during the rollout; destructive changes take two releases. The database itself (backups, point-in-time recovery, upgrades) is your provider's job: the chart never deploys Postgres.
