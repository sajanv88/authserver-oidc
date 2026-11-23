import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The suite runs against the two apps' dev servers, configured like local development: the
// repo root .env locally (as the apps read it), the workflow's env in CI. Variables already
// in the environment win, here and in the apps.
const rootEnv = join(import.meta.dirname, "..", "..", "..", ".env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const origin = (value: string | undefined, fallback: string) =>
  new URL(value?.trim() || fallback).origin;

/** The auth server, also the OIDC issuer. */
export const AUTH_URL = origin(process.env.BETTER_AUTH_URL, "http://auth.localtest.me:3000");

/** The example app: the relying party on a sibling subdomain. */
export const APP_URL = origin(process.env.EXAMPLE_APP_URL, "http://app.localtest.me:3001");

/**
 * Where the server wrapper (scripts/serve.ts) writes each app's output. Outside the repo: the
 * dev servers watch the whole workspace, so a log inside it changes with every request, and on
 * macOS each change reloads the open page, which logs another request, and so on.
 * E2E_OUTPUT_DIR overrides it (CI sets it, to upload the logs when a run fails).
 */
export const OUTPUT_DIR = process.env.E2E_OUTPUT_DIR?.trim() || join(tmpdir(), "auth-server-e2e");

/** The admin `pnpm db:seed` creates. Only the OIDC client scenarios need it. */
export function adminCredentials(): { email: string; password: string } {
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!password) {
    throw new Error("Set SEED_ADMIN_PASSWORD (and run `pnpm db:seed`) for the admin scenarios.");
  }
  return {
    email: process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase() || "admin@localtest.me",
    password,
  };
}
