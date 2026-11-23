# tests

End-to-end behaviour of the auth server and the example app, written as Gherkin features
(`features/*.feature`) with Playwright step definitions (`steps/*.ts`, through
[playwright-bdd](https://vitalets.github.io/playwright-bdd/)). Chromium only.

CI runs it every second day, and on demand: `.github/workflows/e2e.yaml`.

## Run it locally

The suite starts both apps itself with `next dev`, so stop your own dev servers first. It uses
the repo root `.env` like the apps do, and the admin and example client from `pnpm db:seed`.

```sh
pnpm --filter tests browsers     # once: Playwright's Chromium
pnpm test:e2e                    # every feature
pnpm --filter tests e2e:ui       # Playwright's UI mode
pnpm --filter tests e2e:report   # the last HTML report
```

Each scenario creates its own accounts (`e2e-…@example.com`) and OIDC clients, so point
`DATABASE_URL` at a database you don't mind filling, such as the one from `compose.yaml`:

```sh
DATABASE_URL=postgres://app:app@127.0.0.1:5432/auth-server pnpm test:e2e
```

## How it works

- **Email.** The auth server runs with `EMAIL_PROVIDER=console` and prints each email. The
  wrapper Playwright starts the servers with (`scripts/serve.ts`) copies their output to
  `auth-server-e2e/` in the system's temporary folder (`E2E_OUTPUT_DIR` overrides it), and
  `support/mailbox.ts` reads the links from there. It's outside the repo on purpose: the dev
  servers watch the workspace, and a log inside it would reload the open pages on every request.
- **Accounts.** Most scenarios begin with a fresh, confirmed account made through the auth
  server's public API (`support/people.ts`): sign up, then open the emailed link.
- **Rate limits.** The auth server limits sign-ins, sign-ups and emails per client IP. Each
  browser and API client sends an `X-Forwarded-For` of its own, so parallel scenarios don't
  share a budget.
