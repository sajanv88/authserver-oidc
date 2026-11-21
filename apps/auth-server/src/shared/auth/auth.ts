import "server-only";
import { db } from "@repo/db";
import { env } from "@/shared/config/env";
import { sendEmailInBackground } from "@/shared/email";
import { type Auth, createAuth } from "./auth-config";

export type { Auth } from "./auth-config";

let instance: Auth | undefined;

/**
 * The app's Better Auth instance, created on first use. Not at import: `next build` loads route
 * modules, and must never need runtime secrets or a database.
 */
export function getAuth(): Auth {
  instance ??= createAuth({ env: env(), database: db, sendEmail: sendEmailInBackground });
  return instance;
}
