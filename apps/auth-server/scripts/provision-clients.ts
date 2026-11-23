// `pnpm clients:provision <clients.json>`: makes the OIDC clients a deployment needs match the
// file (see provision-core.ts and clients.example.json). Runs against the database and secret
// in the environment, so it works for any environment whose settings you load: locally from
// the repo root .env, or with production's ConfigMap and Secret values. Prints each new
// client's secret once; store it in that app's own secret store right away.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { db } from "@repo/db";
import { createAuth } from "@/shared/auth/auth-config";
import { parseEnv } from "@/shared/config/env-schema";
import { ProvisionError, parseProvisionFile, provision } from "./provision-core";

const say = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new ProvisionError("Usage: pnpm clients:provision <clients.json>");

  // Local by default, like the seed; NODE_ENV=production checks production's rules.
  const parsed = parseEnv({ ...process.env, NODE_ENV: process.env.NODE_ENV ?? "development" });
  if (!parsed.ok) {
    throw new ProvisionError(`Invalid environment:\n  - ${parsed.errors.join("\n  - ")}`);
  }
  const adminEmail = process.env.PROVISION_ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    throw new ProvisionError("Set PROVISION_ADMIN_EMAIL to an admin of this server.");
  }

  // pnpm runs this in apps/auth-server; a relative path means where the command was typed.
  const file = resolve(process.env.INIT_CWD ?? process.cwd(), path);
  let json: unknown;
  try {
    json = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new ProvisionError(`Couldn't read ${file} as JSON.`);
  }

  // No emails from provisioning.
  const auth = createAuth({ env: parsed.env, database: db, sendEmail: () => undefined });
  const results = await provision(auth, db, {
    adminEmail,
    file: parseProvisionFile(json),
    oauth: parsed.env.oauth,
  });

  for (const result of results) {
    say(`${result.name}: ${result.status} (client ID ${result.clientId})`);
    if (result.clientSecret) {
      say(`  client secret, shown only now: ${result.clientSecret}`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof ProvisionError ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
