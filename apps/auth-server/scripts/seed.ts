// `pnpm db:seed`: a local admin and the example client's registration, in the database in
// DATABASE_URL. Local databases only: it refuses NODE_ENV=production and never runs in CI or
// the cluster. Bundled to dist/seed.mjs by esbuild and run with the repo root .env.
import { db } from "@repo/db";
import { createAuth } from "@/shared/auth/auth-config";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";
import { parseEnv } from "@/shared/config/env-schema";
import { SeedError, seed } from "./seed-core";

const say = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new SeedError("The seed is for local databases only, and NODE_ENV is production.");
  }
  // A local script: development unless NODE_ENV says otherwise (the server's own default is
  // production; an explicit production was refused above).
  const parsed = parseEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" });
  if (!parsed.ok) throw new SeedError(`Invalid environment:\n  - ${parsed.errors.join("\n  - ")}`);

  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new SeedError(
      `Set SEED_ADMIN_PASSWORD in .env (at least ${PASSWORD_MIN_LENGTH} characters).`,
    );
  }
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@localtest.me";
  const appUrl = process.env.EXAMPLE_APP_URL?.trim() || "http://app.localtest.me:3001";
  const redirectUri = `${new URL(appUrl).origin}/oidc/callback`;
  // The example's home page: where it comes back to after signing out here too.
  const postLogoutRedirectUri = `${new URL(appUrl).origin}/`;

  // No emails from the seed: the admin is confirmed directly.
  const auth = createAuth({ env: parsed.env, database: db, sendEmail: () => undefined });
  const result = await seed(auth, db, {
    admin: { email, password, name: "Admin" },
    client: { name: "Example app", redirectUri, postLogoutRedirectUri },
  });

  say(`Admin ${result.admin.email}: ${result.admin.status} (verified, role admin).`);
  say(
    `Example app client: ${result.client.status}. Redirect URI ${redirectUri}, after sign-out ${postLogoutRedirectUri}`,
  );
  say(`For apps/example-client, put this in .env:\n  EXAMPLE_CLIENT_ID=${result.client.clientId}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof SeedError ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
