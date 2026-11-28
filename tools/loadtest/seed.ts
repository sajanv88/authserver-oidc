// Seeds load-test users straight into the auth server's database: user1@loadtest.example to
// user<USERS>@loadtest.example, each with a confirmed email, two-factor off, and one password
// (credential) account. Test databases only.
//
//   DATABASE_URL=… PASSWORD=… USERS=10000 pnpm seed
//   DATABASE_URL=… pnpm seed:clean                       (--clean)
//   DATABASE_URL=… pnpm seed:clean --clean-rate-limits   (also the spoofed IPs' rate-limit rows)
//
// Every user gets the same password hash, made once: hashing 10,000 times with scrypt would take
// minutes, and the server's cost per sign-in is the same whatever the hash's salt. Never do this
// outside a test database.
import { hashPassword } from "better-auth/crypto";
import pg, { type Client } from "pg";

const DOMAIN = "loadtest.example";
const EMAIL_PATTERN = `%@${DOMAIN}`;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** The range the k6 scripts spoof client addresses from (RFC 2544's benchmarking range). */
const SPOOFED_PREFIXES = ["198.18.%", "198.19.%"];
/** The auth server's own bounds (apps/auth-server/src/shared/auth/constants.ts). */
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
const MAX_USERS = 1_000_000;

/** What this script reads and writes. Checked before anything is changed. */
const EXPECTED_COLUMNS: Record<string, readonly string[]> = {
  users: [
    "id",
    "name",
    "email",
    "email_verified",
    "two_factor_enabled",
    "banned",
    "created_at",
    "updated_at",
  ],
  accounts: ["id", "account_id", "provider_id", "user_id", "password", "created_at", "updated_at"],
  sessions: ["id", "user_id"],
  rate_limits: ["key"],
};
/** The unique indexes the ON CONFLICT clauses rely on. */
const EXPECTED_INDEXES = ["users_email_key", "accounts_provider_id_account_id_key"];

class SeedError extends Error {}

type Options = {
  databaseUrl: string;
  clean: boolean;
  cleanRateLimits: boolean;
  users: number;
  password: string | undefined;
};

function readOptions(argv: readonly string[], env: NodeJS.ProcessEnv): Options {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new SeedError("DATABASE_URL is required.");
  if (env.NODE_ENV === "production") {
    throw new SeedError("NODE_ENV is production: this seed is for test databases only.");
  }

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new SeedError("DATABASE_URL isn't a URL (postgres://user:password@host:port/db).");
  }
  if (!LOCAL_HOSTS.has(host) && env.ALLOW_REMOTE !== "1") {
    throw new SeedError(
      `DATABASE_URL points at ${host || "a socket or an empty host"}, not localhost. ` +
        "Set ALLOW_REMOTE=1 only for a test database you mean to fill.",
    );
  }

  const users = Number(env.USERS ?? 10_000);
  if (!Number.isInteger(users) || users < 1 || users > MAX_USERS) {
    throw new SeedError(`USERS must be a whole number from 1 to ${MAX_USERS}.`);
  }

  const clean = argv.includes("--clean");
  const cleanRateLimits = argv.includes("--clean-rate-limits");
  if (cleanRateLimits && !clean) {
    throw new SeedError(
      "--clean-rate-limits goes with --clean: pnpm seed:clean --clean-rate-limits",
    );
  }
  const password = env.PASSWORD;
  if (!clean) {
    if (!password) throw new SeedError("PASSWORD is required: the seeded users' password.");
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new SeedError(
        `PASSWORD must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters, as the server requires.`,
      );
    }
  }

  return {
    databaseUrl,
    clean,
    cleanRateLimits,
    users,
    password,
  };
}

/** Stops with a clear message if the schema isn't the one this script was written for. */
async function checkSchema(client: Client): Promise<void> {
  const columns = await client.query<{ table_name: string; column_name: string }>(
    `select table_name, column_name
       from information_schema.columns
      where table_schema = current_schema() and table_name = any($1::text[])`,
    [Object.keys(EXPECTED_COLUMNS)],
  );
  const found = new Map<string, Set<string>>();
  for (const row of columns.rows) {
    const names = found.get(row.table_name) ?? new Set<string>();
    names.add(row.column_name);
    found.set(row.table_name, names);
  }

  const missing: string[] = [];
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const present = found.get(table);
    if (!present) {
      missing.push(`table ${table}`);
      continue;
    }
    for (const column of expected) if (!present.has(column)) missing.push(`${table}.${column}`);
  }

  const indexes = await client.query<{ indexname: string }>(
    `select indexname from pg_indexes
      where schemaname = current_schema() and indexname = any($1::text[])`,
    [EXPECTED_INDEXES],
  );
  const indexNames = new Set(indexes.rows.map((row) => row.indexname));
  for (const index of EXPECTED_INDEXES) if (!indexNames.has(index)) missing.push(`index ${index}`);

  if (missing.length > 0) {
    throw new SeedError(
      `The database doesn't have the auth server's schema (missing: ${missing.join(", ")}). ` +
        "Run the migrations first (pnpm db:migrate at the repo root), or check DATABASE_URL.",
    );
  }
}

async function seed(client: Client, users: number, password: string): Promise<void> {
  const started = Date.now();
  // Once: the same hash for every user (see the top of this file).
  const hash = await hashPassword(password);

  await client.query("begin");
  try {
    // Set-based, and safe to run again: an existing user is put back to the state the tests
    // expect (confirmed, two-factor off, enabled) instead of being added twice.
    const insertedUsers = await client.query<{ inserted: boolean }>(
      `insert into users (name, email, email_verified, two_factor_enabled, banned)
       select 'Load test user ' || i, 'user' || i || '@' || $2::text, true, false, false
         from generate_series(1, $1::int) as i
       on conflict (email) do update
          set email_verified = true, two_factor_enabled = false, banned = false,
              updated_at = now()
       returning (xmax = 0) as inserted`,
      [users, DOMAIN],
    );

    // One credential account per user, as Better Auth makes it: provider "credential", the
    // account id the user's id, the scrypt hash in `password`.
    const insertedAccounts = await client.query<{ inserted: boolean }>(
      `insert into accounts (account_id, provider_id, user_id, password)
       select u.id::text, 'credential', u.id, $3::text
         from users u
         join generate_series(1, $1::int) as i on u.email = 'user' || i || '@' || $2::text
       on conflict (provider_id, account_id) do update
          set password = excluded.password, updated_at = now()
       returning (xmax = 0) as inserted`,
      [users, DOMAIN, hash],
    );
    await client.query("commit");

    const count = (rows: { inserted: boolean }[]) => rows.filter((row) => row.inserted).length;
    const newUsers = count(insertedUsers.rows);
    const newAccounts = count(insertedAccounts.rows);
    console.warn(
      `Seeded ${users} users (${newUsers} new, ${users - newUsers} already there) and their ` +
        `credential accounts (${newAccounts} new, ${(insertedAccounts.rowCount ?? 0) - newAccounts} updated) ` +
        `in ${((Date.now() - started) / 1000).toFixed(1)} s.`,
    );
    console.warn(`Emails: user1@${DOMAIN} to user${users}@${DOMAIN}, all with PASSWORD.`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function clean(client: Client, cleanRateLimits: boolean): Promise<void> {
  await client.query("begin");
  try {
    // Only the load-test users, and what's theirs. Sessions and accounts first, by name; the
    // rest of a user's rows (tokens, consents, two-factor) go with the user (on delete cascade).
    const loadTestUsers = "select id from users where email like $1";
    const sessions = await client.query(
      `delete from sessions where user_id in (${loadTestUsers})`,
      [EMAIL_PATTERN],
    );
    const accounts = await client.query(
      `delete from accounts where user_id in (${loadTestUsers})`,
      [EMAIL_PATTERN],
    );
    const users = await client.query("delete from users where email like $1", [EMAIL_PATTERN]);
    let rateLimits = 0;
    if (cleanRateLimits) {
      // Keys are "<ip>|<path>". Only the range the scripts spoof from.
      const deleted = await client.query("delete from rate_limits where key like any($1::text[])", [
        SPOOFED_PREFIXES,
      ]);
      rateLimits = deleted.rowCount ?? 0;
    }
    await client.query("commit");
    console.warn(
      `Removed ${users.rowCount ?? 0} load-test users, ${sessions.rowCount ?? 0} sessions and ` +
        `${accounts.rowCount ?? 0} accounts` +
        (cleanRateLimits ? `, and ${rateLimits} rate-limit rows of spoofed addresses.` : "."),
    );
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2), process.env);
  const client = new pg.Client({ connectionString: options.databaseUrl });
  await client.connect();
  try {
    await checkSchema(client);
    if (options.clean) await clean(client, options.cleanRateLimits);
    else if (options.password) await seed(client, options.users, options.password);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // A refusal says what to do; anything else is a real failure, with its stack.
  console.error(error instanceof SeedError ? error.message : error);
  process.exitCode = 1;
});
