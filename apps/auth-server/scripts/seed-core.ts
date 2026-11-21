import {
  type Executor,
  getUserSecurityByEmail,
  listOAuthClients,
  updateUserAccess,
} from "@repo/db";
import type { Auth } from "@/shared/auth/auth-config";
import { oidcClientDefaults } from "@/shared/auth/oidc-client-defaults";

// The local seed: an admin, and the example client's OIDC registration. Everything goes
// through Better Auth as the app does it (sign-up, sign-in, the plugin's admin endpoint), except
// the two flags no endpoint sets: the admin role and the confirmed email. Safe to run again:
// an existing admin and an existing client are found, not made twice.

export type SeedInput = {
  admin: { email: string; password: string; name: string };
  client: { name: string; redirectUri: string };
};

export type SeedResult = {
  admin: { email: string; status: "created" | "existing" };
  client: { clientId: string; status: "created" | "existing" };
};

/** A problem the person running the seed can fix; its message says how. */
export class SeedError extends Error {}

/** `name=value` pairs from a response's Set-Cookie headers, as a request's Cookie header. */
function cookieHeaderFrom(response: Headers): Headers {
  const pairs = response.getSetCookie().map((cookie) => cookie.split(";")[0] ?? "");
  return new Headers({ cookie: pairs.filter((pair) => pair.includes("=")).join("; ") });
}

export async function seed(auth: Auth, database: Executor, input: SeedInput): Promise<SeedResult> {
  const { email, password, name } = input.admin;

  let adminStatus: SeedResult["admin"]["status"] = "existing";
  if (!(await getUserSecurityByEmail(database, email))) {
    // Sends a confirmation email to nobody (the seed's sender drops it); confirmed below.
    await auth.api.signUpEmail({ body: { email, password, name } });
    adminStatus = "created";
  }
  const admin = await updateUserAccess(database, email, { role: "admin", emailVerified: true });
  if (!admin) throw new SeedError(`${email} couldn't be created.`);
  if (admin.twoFactorEnabled) {
    throw new SeedError(`${email} has two-factor on, so the seed can't sign in as it.`);
  }

  // The plugin creates clients for a signed-in admin only.
  let session: Headers;
  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      returnHeaders: true,
    });
    session = cookieHeaderFrom(headers);
  } catch {
    throw new SeedError(
      `Couldn't sign in as ${email}. If it already existed, SEED_ADMIN_PASSWORD must be its password.`,
    );
  }

  try {
    const existing = (await listOAuthClients(database, { limit: 100 })).find(
      (client) =>
        client.name === input.client.name && client.redirectUris.includes(input.client.redirectUri),
    );
    if (existing) {
      return {
        admin: { email, status: adminStatus },
        client: { clientId: existing.clientId, status: "existing" },
      };
    }
    const client = await auth.api.adminCreateOAuthClient({
      headers: session,
      body: {
        ...oidcClientDefaults(),
        client_name: input.client.name,
        redirect_uris: [input.client.redirectUri],
        // Public, like the example: PKCE only, no secret to keep.
        token_endpoint_auth_method: "none",
      },
    });
    return {
      admin: { email, status: adminStatus },
      client: { clientId: client.client_id, status: "created" },
    };
  } finally {
    // Leave no session behind.
    await auth.api.signOut({ headers: session }).catch(() => undefined);
  }
}
