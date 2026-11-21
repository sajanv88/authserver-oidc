# auth-server

Next.js 16 app in a pnpm + Turborepo monorepo, built on nuvui, shipped as a Docker image and a Helm chart. Conventions come from the `nuvraxis-frontend` plugin; its skills have the full rules.

## Ground rules

- **pnpm only.** Never write `npm`, `npx` or `yarn` in a file, script or command. Use `pnpm`, `pnpm dlx`, `pnpm exec`. Add dependencies to the workspace `catalog:` in `pnpm-workspace.yaml` and reference them as `"catalog:"`.
- **Node 26**, the exact version in `.node-version`. The Dockerfile base and CI use the same version.
- **Biome formats and lints** everything except SCSS. Don't add ESLint or Prettier. A plugin hook runs `biome check --write` on each file Claude edits.
- **SCSS is BEM + nuvui tokens, linted by stylelint.** One block per file beside its component, global (not `.module.scss`), `@use` never `@import`, every color a token, no `!important`, never select a `nuv-` class.
- **This app uses nuvui. Read it before writing any UI** (see below). Change a component's look by prop → `--nuv-*` variable → token. Blocks: `pnpm dlx shadcn@latest add https://nuvui.nuvraxis.com/r/<name>.json`.
- **Server Components by default.** `"use client"` only on the leaf that needs state, effects or handlers.
- **Every Server Action and route handler** authenticates, validates input with valibot, and authorises against the resource itself.
- **Config:** `NEXT_PUBLIC_*` is baked in at build and identical in every environment. Everything per-environment is a runtime env var read on the server through `env()` in `src/shared/config/env.ts` (schema: `env-schema.ts`).

## Before writing any UI: read nuvui first

Never write nuvui code from memory. Before the first line of a page, component or stylesheet, read the library through the nuvui MCP (`.mcp.json`), passing the `@nuvui/react` version from `apps/auth-server/package.json` as `version`:

1. `get_rules`, then `get_rules` with each topic the work touches.
2. `get_changes` with the installed `@nuvui/*` versions.
3. `list_components` across every package, add-ons included.
4. `list_blocks`, and `list_charts` for any chart; `get_block` / `get_chart` for one that fits, and start from it.
5. `list_guides`, and `get_page` for each guide that applies.
6. `get_page` for every component you'll use, the whole page; `search_docs` for anything you can't place.
7. `get_tokens` before writing any CSS value.

If the MCP isn't connected, read the same from the `nuvraxis-frontend:nuvui` skill and say so.

Next.js 16 differs from older versions you may know: its own guides ship in `apps/auth-server/node_modules/next/dist/docs/`. Read the relevant one before using a Next API you're unsure of.

## Commands

```sh
pnpm dev            # turbo run dev
pnpm typecheck      # next typegen && tsc --noEmit, per package
pnpm lint           # biome check . && stylelint "**/*.scss"
pnpm lint:fix
pnpm build          # turbo run build
docker build -f apps/auth-server/Dockerfile -t auth-server .     # from the repo root
helm lint --strict charts/auth-server
```

Run `pnpm typecheck && pnpm lint && pnpm build` before calling a change done.

## Layout

```
apps/auth-server/            Next.js app: src/app (routing only), src/features/<feature>/, src/shared/, src/proxy.ts
apps/auth-server/Dockerfile  standalone image; build context is the repo root
packages/tsconfig/       shared tsconfig (base.json)
charts/auth-server/          Helm chart, one per app
.github/workflows/       pr.yaml, main.yaml, release.yaml
```

## Feature structure (apps/auth-server/src)

- `app/`: routing only. Thin `page.tsx` / `layout.tsx` / `route.ts` that import from features and shared; no business logic.
- `features/<feature>/`: `components/` (nuvui UI + BEM `.scss`), `actions/` (server actions: session, origin and valibot checks in each), `schemas/` (valibot), `server/` (server-only logic), `hooks/` (only if needed), `types.ts`, `index.ts` (the feature's public API).
- `shared/`: `config/` (env, app constants), `email/`, `ui/` (AuthCard, PageShell, TextLink, NonceProvider), `styles/`, `auth/`.
- Boundaries, enforced by Biome (`noRestrictedImports` overrides in `biome.json`): other code imports a feature only as `@/features/<name>`; a feature never uses `../../` to leave its folder; `shared/` never imports from `features/`.

## Auth (apps/auth-server/src/shared/auth)

- `createAuth(deps)` in `auth-config.ts` is the whole Better Auth configuration, pure (env, database and email sender passed in). `getAuth()` in `auth.ts` builds it once, on first use: never at import, so `next build` needs no secrets. Route handlers that call it start with `await connection()` so they're never prerendered.
- Server code reads the session with `getSession()` / `requireSession(returnTo)` / `requireAdmin()` from `session.ts`. Browser forms use `authClient` from `auth-client.ts` and post to `/api/auth/*`, so Better Auth's rate limiter, origin checks and the OIDC flow resume apply (its server API, `auth.api.*`, is not rate limited).
- OIDC: the issuer is `BETTER_AUTH_URL` (bare origin). Discovery at `/.well-known/openid-configuration`, keys at `/jwks` (RS256), endpoints under `/api/auth/oauth2/*`. Code + PKCE (S256) and refresh only.
- Signed-in pages live under `app/(app)/`: the layout renders `PageShell` and checks the session, and every page and server action checks again itself (`requireSession(path)` / `requireAdmin(path)`), because layouts don't re-run on every navigation. Each page renders its own `PageHeader`. Routes that read the session set `export const instant = false`: they block on the session check by design.
- `proxy.ts` sends `/account/*` and `/admin/*` without a session cookie to `/login?returnTo=…` (convenience only), sets the nonce CSP (`shared/security/csp.ts`) on every document, and passes `x-pathname` for layouts. Every `returnTo` goes through `safeReturnPath`.
- Auth forms (features' client components): `AuthForm` + `SubmitButton` (shared/ui/auth-form), fields in nuvui `Field`s, rules from `shared/validation/fields.ts` via `parseForm` (one `FieldError` per field, focus the first invalid one), calls through `authClient`, errors through `authErrorMessage` (never the server's text). Same answer whether or not an email exists.
- Links between auth pages: `authPageHref(page, query)` (shared/auth/auth-pages.ts). In an OIDC flow, pass `signedOidcQuery(searchParams)` along unchanged; to resume after an email round trip, use `authorizeUrlFrom(...)` (a fresh authorize request) as the destination, with `{ freshSignIn: true }` when the emailed link itself signs the user in (confirmation, magic link) so `prompt=login`/`max_age` don't send them back to /login. Redirect to query-string paths only through `redirectToSafePath`.
- `auth-config.test.ts` drives the real configuration over HTTP against PGlite (`@repo/db/testing`). Change the config, change or extend those tests.

## Delivery

PR → `pr.yaml` checks (Biome, stylelint, typecheck, build, Docker build + health check, helm lint + kubeconform). Nothing is published.
Merge to `main` → `main.yaml` builds the image once (amd64 + arm64) and pushes `ghcr.io/nuvraxis/auth-server:sha-<short-sha>` and `:main`.
Tag `vX.Y.Z` → `release.yaml` retags that commit's image as `:vX.Y.Z` and `:latest` (no rebuild), pushes the chart to `oci://ghcr.io/nuvraxis/charts/auth-server` at `X.Y.Z`, and creates the GitHub Release.
Argo CD syncs the chart from the OCI registry (production) or from `charts/auth-server` in git.

Release ritual: merge to main → wait for `main.yaml` to go green → `git tag vX.Y.Z && git push origin vX.Y.Z`. Never edit `version`/`appVersion` in `Chart.yaml`; the release sets them.

## Which skill applies

| Working on | Skill |
|---|---|
| `.ts`/`.tsx` types, tsconfig, validation | `nuvraxis-frontend:typescript-production` |
| Pages, data, caching, actions, env | `nuvraxis-frontend:nextjs-production` |
| Auth, cookies, CSP, headers, redirects | `nuvraxis-frontend:nextjs-security` |
| `biome.json`, lint/format errors | `nuvraxis-frontend:biome` |
| `.scss` | `nuvraxis-frontend:scss-bem` |
| Workspace, catalog, `turbo.json` | `nuvraxis-frontend:pnpm-turborepo` (engine details: `turborepo`) |
| `Dockerfile`, `.dockerignore` | `nuvraxis-frontend:docker-nextjs` |
| `charts/` | `nuvraxis-frontend:helm-nextjs` |
| `.github/workflows/` | `nuvraxis-frontend:github-actions` |
| nuvui components, theming, blocks | `nuvraxis-frontend:nuvui` |

## Database (nuvraxis-fullstack)

PostgreSQL through Drizzle ORM v1, in `packages/db` (`@repo/db`). Rules: the `nuvraxis-fullstack` skills `drizzle-postgres`, `db-package` and `postgres-ops`; drizzle-kit itself: the vendored `drizzle-kit*` skills.

- `packages/db` is the only package that imports `drizzle-orm` or `pg`. Apps import `db`, types and query functions from `@repo/db`.
- Schema change: edit `packages/db/src/schema/`, then `pnpm db:generate`, read the SQL, commit it. Never edit a committed migration; add a new one. Never `drizzle-kit push` outside a throwaway local database.
- Validate input with valibot before any insert; never pass `FormData` to a query.
- Better Auth reaches the database only through `createAuthAdapter(db)` from `@repo/db`, and must run with `advanced.database.generateId: "uuid"` (the adapter refuses to start otherwise). The tables mirror Better Auth's `getAuthTables()` for our plugin set: adding or upgrading a Better Auth plugin means a schema change, a migration, and an updated `src/auth-adapter.test.ts`, which runs a real `betterAuth()` against the migrated schema.
- `@better-auth/oauth-provider` needs `clientPrivileges` (admins only) to create clients, and `allowInsecureRedirectUri` to accept `http://` redirect URIs outside loopback (local `*.localtest.me` only, never in production).
- Local database: `cp .env.example .env`, point `DATABASE_URL` at a Postgres database (or `docker compose up -d`), then `pnpm db:migrate`.
- Never commit `.env` or any `DATABASE_URL` with real credentials. In Kubernetes it comes from an existing Secret, and the chart only references it by name.
- Migrations reach production as an Argo CD PreSync Job running `node packages/db/dist/migrate.mjs` from the app image.
- The drizzle-kit MCP server is in `.mcp.json` but disabled in `.claude/settings.json`: it can `push` and `pull` against whatever `DATABASE_URL` is set. Enable it only while that points at a local database.

```sh
pnpm db:generate   # new migration from the schema diff
pnpm db:check      # migration conflicts across branches
pnpm db:migrate    # build + apply with the bundled runner
pnpm db:studio     # local inspection only
```
