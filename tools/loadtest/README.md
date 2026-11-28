# Load tests for the auth server

A user seed and three [k6](https://grafana.com/docs/k6/latest/) scripts. This is test tooling only: nothing here is shipped, and nothing here changes the app.

| File | What it does |
|---|---|
| `seed.ts` | Puts N users straight into a test database: `user1@loadtest.example` and up, emails confirmed, two-factor off, one password each. `--clean` removes them |
| `token-endpoint.js` | Client credentials at `/api/auth/oauth2/token` |
| `password-signin.js` | `POST /api/auth/sign-in/email` as a random seeded user |
| `code-pkce-flow.js` | An app's whole sign-in: authorize, `/login`, sign-in, consent, the code exchanged at `/token`, then userinfo |
| `lib/common.js` | What the scripts share: the staircase, the counters, spoofed addresses |
| `clients.loadtest.json` | A web client and a machine client, for `pnpm clients:provision` |

This folder isn't part of the pnpm workspace: it has its own `package.json`, and its own `pnpm-workspace.yaml` holding settings only, so it installs on its own. It may import `pg` directly, because it's outside `apps/` and `packages/`.

## Read this first: what the server does to load tests

Each of these comes from the code, not from a guess.

- **Rate limits are fixed in code, not settings.** Better Auth counts per client address and path, in the `rate_limits` table, shared by every replica. The numbers are `RATE_LIMIT_RULES` in `apps/auth-server/src/shared/auth/auth-config.ts`:

  | Endpoint | Limit per address | Set by |
  |---|---|---|
  | Sign-in (`/sign-in/email`) | 5 a minute | `RATE_LIMIT_RULES` |
  | Token endpoint (`/oauth2/token`) | 30 a minute | `RATE_LIMIT_RULES`, over the OAuth plugin's 20 |
  | Authorize (`/oauth2/authorize`) | 30 a minute | The OAuth plugin's default |
  | Userinfo (`/oauth2/userinfo`) | 60 a minute | The OAuth plugin's default |
  | Revoke, introspect | 30, 100 a minute | The OAuth plugin's defaults |
  | Everything else | 100 a minute | `RATE_LIMIT_RULES`' global limit |

  No environment variable changes them. From one address, a sign-in test turns into a 429 test after the fifth request, and a code-flow test after the 30th authorize.
- **The only way past them without changing code is spreading the client address.** With `SPOOF_IP=1` the scripts send `X-Forwarded-For` with a random address from `198.18.0.0/15`, the range reserved for benchmarking, which is never a real client. Better Auth believes that header:
  - **No `TRUSTED_PROXIES`:** it uses the header when it holds exactly one address.
  - **`TRUSTED_PROXIES` set:** it uses the rightmost address that isn't a trusted proxy.

  So it works when the header reaches the app as k6 sent it. That's the case from inside the cluster to the Service, or through an ingress whose addresses, and the generator's, are in `TRUSTED_PROXIES`. Check that it worked (see [Run](#run)).
- **No address at all means one bucket for everyone.**
  - **In production mode** (the image), with no usable header, Better Auth logs a warning and puts every client in a single bucket per path. That means 5 sign-ins a minute for the whole test.
  - **In development** (`pnpm dev`) every client counts as `127.0.0.1`.
- **Turnstile test keys don't work against the image.** In production mode the server checks that a Turnstile token was issued for its own hostname, and Cloudflare's test keys report `example.com`, so every token is refused. A real token needs a real browser widget, which k6 can't produce. **Load-test with Turnstile off** (both `TURNSTILE_*` empty). The scripts send `CAPTCHA_TOKEN` as `X-Captcha-Response` if you set it, for a development server with the test keys.
- **The password hash is Better Auth's default scrypt.** That's N=16384, r=16, p=1 and 64 bytes, stored as `salt:hex`, with no override in the config.
  - **Time:** each sign-in runs one hash, on Node's libuv thread pool, which has 4 threads unless `UV_THREADPOOL_SIZE` says otherwise. That pool is the first ceiling a sign-in test meets.
  - **Memory:** each running hash needs 128 × N × r = 32 MiB. 4 at once is 128 MiB, against the chart's 512 Mi memory limit. Raising `UV_THREADPOOL_SIZE` raises both throughput and peak memory.
- **Every request writes to the database twice before its own work:** the rate limiter reads and updates its row. Spoofed addresses add a row per address and path; `--clean-rate-limits` removes them.

### What k6 can't do the way a browser does

The login and consent pages post to **Next.js server actions**, and k6 can't make those requests reliably:

- A server action is called by a POST to the page with a `Next-Action` header. The ID in it is generated per build and appears only in the page's JavaScript.
- The body and the answer are React Server Components payloads, not a documented format.
- A script that scraped the ID from one build would break at the next.

What the actions do is call Better Auth in-process with a fixed JSON body (`callEndpoint` in `apps/auth-server/src/shared/auth/endpoint.ts`): `/sign-in/email` with `oauth_query` for the login form, `/oauth2/consent` with `accept` and `oauth_query` for consent. k6 sends those same bodies to those endpoints over HTTP, and loads the pages themselves as a browser would (`login_page`, `consent_page`). The results therefore leave out:

- the server action's own handling: form parsing, valibot, the trace span, and rendering its answer;
- the "leaving for the app" page;
- the proxy's stray-cookie clean-up on form posts.

Every other step is what a browser and an app do. Nothing in the flow is guessed:

- **PKCE:** the challenge is S256.
- **Signed query:** it's carried byte for byte.
- **CSRF:** Better Auth's check is the `Origin` header, sent as `ISSUER`.
- **Code:** read from the redirect to the app, with its `state` and `iss` checked.

## Setup

1. **k6**, 0.50 or later (written for the 1.x API: `k6/http`, `k6/crypto`, `k6/encoding`, `ramping-arrival-rate`). See [installation](https://grafana.com/docs/k6/latest/set-up/install-k6/).
2. **This folder's dependencies** (Node 24 or later). The same in Bash and PowerShell:

   ```sh
   cd tools/loadtest
   pnpm install
   pnpm typecheck
   ```

3. **A test environment.** That's either the chart deployed to a test namespace, or locally, the app with its own database. See [The test environment](#the-test-environment).
4. **Clients:**
   - **On a test cluster:** provision them from `clients.loadtest.json` (below).
   - **Locally:** `pnpm db:seed` already registers the example app. It's public, so no `CLIENT_SECRET`, with the redirect URI `http://app.localtest.me:3001/oidc/callback`.

### Clients from `clients.loadtest.json`

The machine client needs an API scope the server offers, so set `OAUTH_API_SCOPES` to include `loadtest` first, on the server and in the environment you provision from.

Provisioning checks the whole environment as the app does (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `OAUTH_API_SCOPES`, …), so load the test environment's settings into your shell first. Leave out `NODE_ENV=production` unless they meet production's rules. Then, from the repo root, as an admin of that environment:

Bash:

```sh
PROVISION_ADMIN_EMAIL=<an admin of the test environment> \
pnpm clients:provision tools/loadtest/clients.loadtest.json
```

PowerShell:

```powershell
$env:PROVISION_ADMIN_EMAIL = "<an admin of the test environment>"
pnpm clients:provision tools/loadtest/clients.loadtest.json
```

It prints each client's ID, and a new client's secret once.

- **Load test web:** confidential (`client_secret_basic`), so `code-pkce-flow.js` needs its `CLIENT_SECRET`. Its redirect URI is never contacted: the script reads the code off the redirect.
- **Load test service:** for `token-endpoint.js`. It may only use `client_secret_basic`: with `AUTH_METHOD=post` it gets `invalid_client`, which tests the refusal, not the endpoint.

## The test environment

Settings to change there, by their real names (`.env.example`, the chart's ConfigMap and Secret):

| Setting | For a load test |
|---|---|
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Both empty: Turnstile off (see above) |
| `TRUSTED_PROXIES` | The ingress pods' addresses (as in production), plus the load generator's when it goes through the ingress, so spoofed addresses survive. Not in `.env.example`: it's on the chart's ConfigMap |
| `BETTER_AUTH_URL` | The test environment's own address. The scripts' `ISSUER` must be exactly this |
| `TRUSTED_ORIGINS` | Unchanged: the scripts send `Origin` as the server's own address, which is always trusted |
| `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Production mode refuses `console`. Point SMTP at a mail sink. Signing in seeded users sends no email, but a real sign-up or reset would |
| `OAUTH_API_SCOPES` | Include `loadtest` for the machine client. `OAUTH_RESOURCES` (https) only to test `RESOURCE` |
| `DATABASE_POOL_MAX` | Connections per pod (default 10). Replicas × this must stay under the database's limit |
| `UV_THREADPOOL_SIZE` | Node's own: how many scrypt hashes run at once (see above). Change it in one run at a time, and watch memory |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | A collector, to see where time goes: every endpoint and query is traced |

There's no setting for the rate limits. Relaxing them for a test environment would need a code change, for example making `RATE_LIMIT_RULES` configurable outside production. That's out of scope here.

Locally, `pnpm dev` is useful for a functional smoke test but not for numbers: development mode is far slower than the build. `next start` runs in production mode, which wants https and SMTP, so measure on the test cluster.

## Settings for the scripts

Pass each with `-e NAME=value`.

| Name | Scripts | Default | What |
|---|---|---|---|
| `ISSUER` | all | required | The server's base URL, `BETTER_AUTH_URL` exactly |
| `RATE` | all | `5` | Iterations a second at the first step. The steps are ×1, ×2, ×4, ×8 |
| `HOLD` | all | `2m` | How long each step is held |
| `RAMP` | all | `30s` | How long the climb to each step takes |
| `PRE_VUS`, `MAX_VUS` | all | from `RATE` | The VU pool. Raise `MAX_VUS` when `dropped_iterations` appears and the generator has CPU to spare |
| `P95_MS` | all | 300 / 1000 / 1000 | The p95 threshold for all requests |
| `STEP_P95_MS` | flow | `1000` | The p95 threshold for each step |
| `FAIL_RATE` | all | `0.01` | The share of failed requests allowed |
| `SMOKE` | all | `0` | `1`: one iteration on one VU |
| `SPOOF_IP` | all | `0` | `1`: a random `X-Forwarded-For` from `198.18.0.0/15`, one per iteration |
| `CLIENT_ID`, `CLIENT_SECRET` | token, flow | required (secret optional for a public client in the flow) | The client |
| `AUTH_METHOD` | token | `basic` | `basic` or `post` |
| `SCOPE` | token, flow | none / `openid profile email offline_access` | Scopes asked for |
| `RESOURCE` | token, flow | none | An API (RFC 8707): the access token becomes a JWT for it |
| `REDIRECT_URI` | flow | required | One the client registered, exactly |
| `PAGES` | flow | `1` | `0` skips loading the login and consent pages |
| `USERINFO` | flow | `1` (`0` with `RESOURCE`) | Ask userinfo with the new access token |
| `USERS` | seed, sign-in, flow | `10000` | How many users are seeded, and drawn from |
| `PASSWORD` | seed, sign-in, flow | required | The seeded users' password, 12 to 128 characters |
| `SIGN_OUT` | sign-in | `0` | `1`: sign out after each sign-in, so sessions don't pile up |
| `CAPTCHA_TOKEN` | sign-in, flow | none | Sent as `X-Captcha-Response` |

The seed reads `DATABASE_URL`, `USERS`, `PASSWORD` and `ALLOW_REMOTE`:

- **`DATABASE_URL`:** the seed refuses any host but `localhost`, `127.0.0.1` and `[::1]` unless `ALLOW_REMOTE=1`. It also refuses `NODE_ENV=production`.
- **Schema check:** before changing anything, it checks that the tables, columns and unique indexes it uses exist.

## Run

From `tools/loadtest`. Each step has Bash and PowerShell (7 or later). PowerShell has no `NAME=value command`, so variables are set with `$env:` for the session and removed after.

Keep the password in your shell, not in a file. It's asked for without showing it.

Bash:

```sh
read -rs LOADTEST_PASSWORD && export LOADTEST_PASSWORD
```

PowerShell:

```powershell
$env:LOADTEST_PASSWORD = Read-Host -MaskInput "Load test password"
```

1. **Seed** (idempotent: run it again and nothing is added twice).

   `pnpm seed` and `pnpm seed:clean` read `tools/loadtest/.env.loadtest` when it exists. The repo's `.gitignore` covers `.env*`, so it's never committed. Put the database there, and pass the rest on the command line:

   ```sh
   # tools/loadtest/.env.loadtest
   DATABASE_URL=postgres://…
   USERS=10000
   ```

   Bash:

   ```sh
   ALLOW_REMOTE=1 PASSWORD="$LOADTEST_PASSWORD" pnpm seed
   ```

   PowerShell:

   ```powershell
   $env:ALLOW_REMOTE = "1"; $env:PASSWORD = $env:LOADTEST_PASSWORD
   pnpm seed
   Remove-Item Env:ALLOW_REMOTE, Env:PASSWORD
   ```

   `ALLOW_REMOTE=1` is needed for any database that isn't on this machine. Keep it on the command line rather than in the file, so filling a remote database stays a deliberate step. The variables of your shell win over the file's.

2. **Smoke test:** one iteration of each, on one VU. Every check must pass before a real run.

   Bash:

   ```sh
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e CLIENT_ID=… -e CLIENT_SECRET=… token-endpoint.js
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e PASSWORD="$LOADTEST_PASSWORD" password-signin.js
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e CLIENT_ID=… -e CLIENT_SECRET=… \
     -e REDIRECT_URI=https://loadtest-app.example/oidc/callback -e PASSWORD="$LOADTEST_PASSWORD" code-pkce-flow.js
   ```

   PowerShell (a backtick at the end of a line continues it):

   ```powershell
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e CLIENT_ID=… -e CLIENT_SECRET=… token-endpoint.js
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e "PASSWORD=$env:LOADTEST_PASSWORD" password-signin.js
   k6 run -e SMOKE=1 -e ISSUER=https://auth.test.example -e CLIENT_ID=… -e CLIENT_SECRET=… `
     -e REDIRECT_URI=https://loadtest-app.example/oidc/callback -e "PASSWORD=$env:LOADTEST_PASSWORD" code-pkce-flow.js
   ```

   Then check that spoofed addresses reach the server: run a smoke test with `-e SPOOF_IP=1`, then in the test database:

   ```sql
   select key from rate_limits where key like '198.18.%' or key like '198.19.%' limit 5;
   ```

   - **Rows:** the server sees the spoofed addresses.
   - **None:** something in between rewrites `X-Forwarded-For`, and the per-address limits will throttle the run.

3. **The real run**, one script at a time, with a summary kept:

   Bash:

   ```sh
   mkdir -p results
   k6 run -e ISSUER=https://auth.test.example -e SPOOF_IP=1 -e RATE=5 -e HOLD=2m \
     -e CLIENT_ID=… -e CLIENT_SECRET=… \
     --summary-export results/token-endpoint.json token-endpoint.js
   ```

   PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force results | Out-Null
   k6 run -e ISSUER=https://auth.test.example -e SPOOF_IP=1 -e RATE=5 -e HOLD=2m `
     -e CLIENT_ID=… -e CLIENT_SECRET=… `
     --summary-export results/token-endpoint.json token-endpoint.js
   ```

   The same for `password-signin.js` and `code-pkce-flow.js`, with their settings. At `RATE=5` the staircase is 5, 10, 20 and 40 iterations a second, about 10 minutes in all.

4. **Clean up** after the last run:

   Bash:

   ```sh
   ALLOW_REMOTE=1 pnpm seed:clean
   ALLOW_REMOTE=1 pnpm seed:clean --clean-rate-limits   # also the spoofed addresses' rows
   ```

   PowerShell:

   ```powershell
   $env:ALLOW_REMOTE = "1"
   pnpm seed:clean
   pnpm seed:clean --clean-rate-limits   # also the spoofed addresses' rows
   Remove-Item Env:ALLOW_REMOTE
   ```

   When you're done, `Remove-Item Env:LOADTEST_PASSWORD` in PowerShell, or `unset LOADTEST_PASSWORD` in Bash.
   This removes only `@loadtest.example` users and what belongs to them: sessions, accounts, and through the cascade their tokens, consents and two-factor rows. Clean up and seed again between runs you mean to compare, so each starts with the same tables.

### Reading the results

| Metric | Meaning |
|---|---|
| `http_429` | The rate limiter answered. Spoofing isn't reaching the server, or `SPOOF_IP` is off |
| `http_5xx` | The server gave way. These are the failures that matter |
| `dropped_iterations` | k6 couldn't start iterations at the asked rate: every VU was busy (see below) |
| `consent_shown` (flow) | How many flows met the consent screen. Only a user's first sign-in to the app does |

Each step of the flow has its own line, `http_req_duration{name:…}`.

## Results

### 2026-11-28: dev cluster, `RATE=2`, `HOLD=1m`

**Setup**
- **Server:** a dev cluster, the image's production mode. One pod (50m CPU request, no CPU limit, 512 Mi memory), `DATABASE_POOL_MAX=5`, on k3s on the same laptop as k6.
- **Path:** reached through the Tailscale ingress.
- **Data:** 10,000 seeded users. `SPOOF_IP=1`, with this PC's tailnet address added to `TRUSTED_PROXIES`.
- **Load:** each script ran a 6-minute staircase of 2, 4, 8 and 16 iterations a second. k6 never needed more than 3 VUs and dropped no iterations, so the generator wasn't the limit.

**Verdict: this run measured the rate limiter, not the server.** Every request shared one rate-limit bucket. At 07:57:27 UTC the server logged that it *could not determine a client IP and is falling back to a single shared per-path bucket*. Successful requests therefore come in at exactly the per-bucket limits:
- token endpoint: 178 in 6 minutes, 30 a minute;
- sign-in: 30 in 6 minutes, 5 a minute;
- authorize: 180 in 6 minutes, 30 a minute.

#### By script

| Script | Requests | Rate | Succeeded | 429 | Other failures | p95, all | Succeeded: median / p95 |
|---|---|---|---|---|---|---|---|
| `token-endpoint.js` | 2,489 | 6.9/s | 178 (7.2%) | 2,311 (92.8%) | 0 | 13.7 ms | 14.0 / 18.3 ms |
| `password-signin.js` | 2,520 (2,490 sign-ins, 30 sign-outs) | 7.0/s | 30 sign-ins (1.2%), 30 sign-outs | 2,460 (97.6%) | 0 | 9.7 ms | 70.9 / 106.7 ms (sign-ins and sign-outs together) |
| `code-pkce-flow.js` | 2,940 in 2,490 flows | 8.2/s | 0 flows completed | 2,460 (authorize 2,310, sign-in 150) | 30 (every token exchange) | 22.1 ms | 19.8 / 106.5 ms |

No 5xx in any run.

#### The code flow, step by step

| Step | Requests | Succeeded | Median | p95 | Max | What happened |
|---|---|---|---|---|---|---|
| `authorize` | 2,490 | 180 | 7.6 ms | 11.3 ms | 38.0 ms | The rest were 429: the OAuth plugin's 30 a minute |
| `login_page` | 180 | 180 | 21.3 ms | 39.6 ms | 534.5 ms | Server-rendered `/login`. The max is the first, cold render |
| `sign_in` | 180 | 30 | 5.9 ms | 120.5 ms | 140.5 ms | The rest were 429 (5 a minute). The median is the fast 429s; p95 is the scrypt sign-ins |
| `consent_page` | 30 | 30 | 30.4 ms | 67.6 ms | 81.5 ms | Every flow met consent: each was a user's first sign-in to the app |
| `consent` | 30 | 30 | 18.7 ms | 41.7 ms | 46.9 ms | Always the way back to the app, with a code, the same `state` and `iss` |
| `token` | 30 | **0** | 7.6 ms | 23.8 ms | 33.6 ms | **All refused, with a 4xx other than 429.** Cause not known yet (below) |
| `userinfo` | 0 | | | | | Never reached |

#### Thresholds

In `--summary-export`, `true` next to a threshold means it was crossed.

| Threshold | Token | Sign-in | Flow |
|---|---|---|---|
| `http_req_failed` under 1% | crossed (92.8%) | crossed (97.6%) | crossed (84.7%) |
| `checks` over 99% | crossed (25.7%) | crossed (26.1%) | crossed (13.7%) |
| p95 latency | passed (13.7 < 300 ms) | passed (9.7 < 1,000 ms) | passed, every step under 1,000 ms |

#### What it tells us

1. **Spoofed addresses don't survive the Tailscale ingress.**
   - **What was observed:** the shared-bucket warning means Better Auth found no client address it trusts.
   - **The likely cause (inferred, not observed directly):** the Tailscale proxy replaces `X-Forwarded-For` with this PC's tailnet address, instead of adding it to what k6 sent. With that address in `TRUSTED_PROXIES`, nothing untrusted is left, so every request from this PC lands in one shared bucket.
   - **Before that address was added**, they'd all have counted as this PC instead. That's the same limit.
   - **Consequence:** from outside the cluster, a load test can't get past the rate limits on this ingress.
2. **Rejections are cheap.** About 7 requests a second, almost all 429s, were answered at p95 9–14 ms by one pod with a 50m CPU request. That includes the rate limiter's database read and write for each. The limiter isn't a bottleneck at this rate.
3. **Successful requests are quick at this load, which is close to no load:**
   - token endpoint: 14 ms median, 18 ms p95;
   - login page: 21 ms median;
   - consent: 19 ms median;
   - password sign-in with scrypt: about 100 ms at the high end.

   With 5 to 30 successes a minute, that's an idle server's latency, not capacity.
4. **The token exchange at the end of the flow failed every time, and the reason is still open.**
   - It wasn't a 429 (all 2,460 are accounted for by authorize and sign-in) and not a 5xx.
   - Everything up to it passed: a code, the right `state`, the issuer as `iss`.
   - The candidates are the client's authentication (`invalid_client`: the provisioned web client is `client_secret_basic`, so check `CLIENT_SECRET`) and the exchange itself (`invalid_grant`).
   - One smoke run with `--http-debug=full` shows the answer's body.

#### Before the next run

- [ ] Take this PC's tailnet address back out of `TRUSTED_PROXIES` in `values-dev.yaml`, and upgrade. It doesn't help, and while it's there this PC's requests share one bucket.
- [ ] Find why the flow's token exchange fails:
  ```powershell
  k6 run -e SMOKE=1 -e ISSUER=$ISSUER -e CLIENT_ID=$WEB_ID -e CLIENT_SECRET=$WEB_SECRET -e REDIRECT_URI=https://loadtest-app.example/oidc/callback -e "PASSWORD=$env:LOADTEST_PASSWORD" --http-debug=full code-pkce-flow.js
  ```
- [ ] To measure the server instead of the limiter, choose one:
  - **Run k6 inside the cluster against the Service.** The header then reaches the pod as k6 sent it. The scripts need a target URL separate from `ISSUER` for this.
  - **Make the rate limits configurable outside production.** That's a code change.
- [ ] Clean up and seed again, so the next run starts with the same tables.

## Pitfalls

- **Don't target `kubectl port-forward`.** It's one tunnel through the API server to one pod. You'd measure the tunnel, and bypass the Service, the ingress and every other replica. Run k6 in the cluster against the Service, or from outside through the ingress.
- **Rate limits.** As above: there's no setting, so use `SPOOF_IP=1`, check that it reaches the server, and set `TRUSTED_PROXIES` so it does. Expect 429s without it.
- **Turnstile.** Off for load tests. The test keys are refused by a production build.
- **One password hash for every seeded user.** That's fine for the server's cost (scrypt takes as long whatever the salt), and it's why seeding is quick. It's also why the seed is for test databases only.
- **Generator or server?** `dropped_iterations` means k6 ran out of VUs. That's either because the server slowed down and every VU is waiting on it, or because `MAX_VUS` is too low.
  - **The server slowed down** when `http_req_duration` climbs with it.
  - **The generator is short** when it's at full CPU while the server isn't: give it more CPU, or split the load across generators.
  - **The pods are capped** when their CPU is throttled: `container_cpu_cfs_throttled_periods_total` rises, or `kubectl top pod` sits at the CPU limit. You're measuring the limit, not the code.
- **Growing tables.** Each sign-in adds a session, each flow tokens, each spoofed address and path a rate-limit row. Later runs then meet bigger tables than earlier ones. Clean up and seed again between runs you compare.
- **Consent once.** In the flow, only a user's first sign-in to the app shows consent. With 10,000 users and a short run, most flows show it; on a second run, almost none do.
- **The numbers are relative.** They compare one build, setting or replica count with another on the same environment. They aren't production capacity: production has other hardware, other traffic, a database of another size and real users' cache behaviour.

## Failure scenarios, for later

Not built yet.

- [ ] **Multi-tab refresh:** one session in several tabs refreshing at once, the same refresh token presented concurrently. Rotation and replay: who wins, and who gets signed out.
- [ ] **Pod deletion mid-run:** delete a pod during a run. In-flight requests, readiness, and how long until the others take over.
- [ ] **`helm upgrade` under load:** a rolling update during a run. 5xx during the rollout, connection draining, sessions surviving it.
- [ ] **Slow database:** Toxiproxy between the app and Postgres, with added latency and dropped connections. Pool exhaustion, timeouts, and whether the health probes behave.
- [ ] **Spike:** from idle to the top rate in seconds instead of a staircase. Cold pools and caches, and the autoscaler's reaction.
