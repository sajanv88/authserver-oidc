// Runs a real Better Auth instance, with every plugin the app uses, against a fresh PGlite
// database migrated with our committed migrations. If a table or column doesn't match what
// Better Auth or a plugin writes, these fail here instead of on the first request in the app.

import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt, magicLink, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createAuthAdapter } from "./auth-adapter";
import { getOAuthClientPublicInfo, listOAuthClients } from "./queries/oauth-clients";
import { getUserSecurityByEmail } from "./queries/users";
import { jwks, oauthClients, rateLimits, twoFactors, users, verifications } from "./schema";
import { createTestDb } from "./testing/pglite";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const baseURL = "http://localhost:3000";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const email = "ada@example.com";
const password = "correct horse battery staple";

function createAuth(db: TestDb, sentLinks: string[]) {
  return betterAuth({
    baseURL,
    secret: "test-secret-that-is-at-least-32-characters-long",
    database: createAuthAdapter(db),
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: { type: "string", input: false, required: false, defaultValue: "user" },
      },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 100 },
    disabledPaths: ["/token"],
    plugins: [
      magicLink({
        sendMagicLink: async ({ url }) => {
          sentLinks.push(url);
        },
      }),
      twoFactor(),
      jwt({ disableSettingJwtHeader: true }),
      oauthProvider({
        loginPage: "/login",
        consentPage: "/consent",
        // As in the app: only admins manage clients. `role` comes from the users table.
        clientPrivileges: ({ user }) => (user as { role?: string }).role === "admin",
        // As in local dev: plain http redirects only for the *.localtest.me demo hosts.
        allowInsecureRedirectUri: (url) => url.hostname.endsWith(".localtest.me"),
      }),
    ],
  });
}

describe("Better Auth on the @repo/db schema", () => {
  let db: TestDb;
  let auth: ReturnType<typeof createAuth>;
  const sentLinks: string[] = [];
  let cookie = "";

  beforeAll(async () => {
    db = await createTestDb();
    auth = createAuth(db, sentLinks);
  });

  it("refuses to start without uuid ids", async () => {
    const instance = betterAuth({
      baseURL,
      secret: "test-secret-that-is-at-least-32-characters-long",
      database: createAuthAdapter(db),
      emailAndPassword: { enabled: true },
    });
    await expect(instance.api.getSession({ headers: new Headers() })).rejects.toThrow(/generateId/);
  });

  it("signs up with a uuid id and the default role", async () => {
    const { user } = await auth.api.signUpEmail({ body: { email, password, name: "Ada" } });
    expect(user.id).toMatch(uuid);
    expect(await getUserSecurityByEmail(db, email)).toMatchObject({
      id: user.id,
      role: "user",
      twoFactorEnabled: false,
    });
  });

  it("signs in over HTTP, creates a session and counts the request in rate_limits", async () => {
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: baseURL },
        body: JSON.stringify({ email, password }),
      }),
    );
    expect(response.status).toBe(200);
    cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    expect(cookie).toMatch(/session_token=/);

    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.session.id).toMatch(uuid);
    expect(await db.select().from(rateLimits)).not.toHaveLength(0);
  });

  it("enables two-factor (two_factors row, flag set only after verification)", async () => {
    const result = await auth.api.enableTwoFactor({
      body: { password },
      headers: new Headers({ cookie }),
    });
    if (result.method !== "totp")
      throw new Error(`expected a TOTP enrolment, got ${result.method}`);
    expect(result.totpURI).toMatch(/^otpauth:\/\/totp\//);
    expect(await db.select().from(twoFactors)).toHaveLength(1);
    expect(await getUserSecurityByEmail(db, email)).toMatchObject({ twoFactorEnabled: false });
  });

  it("stores a magic-link token in verifications", async () => {
    await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
    expect(sentLinks).toHaveLength(1);
    expect(await db.select().from(verifications)).not.toHaveLength(0);
  });

  it("creates and serves a signing key from jwks", async () => {
    const keys = await auth.api.getJwks();
    expect(keys.keys.length).toBeGreaterThan(0);
    expect(await db.select().from(jwks)).toHaveLength(1);
  });

  const clientBody = {
    client_name: "Example client",
    redirect_uris: ["http://app.localtest.me:3001/oidc/callback"],
    token_endpoint_auth_method: "client_secret_basic",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code" as const],
  };

  it("refuses to create an OAuth client for a non-admin session", async () => {
    await expect(
      auth.api.adminCreateOAuthClient({ body: clientBody, headers: new Headers({ cookie }) }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it("creates an OAuth client for an admin, with a hashed secret, visible to the queries", async () => {
    await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
    const created = await auth.api.adminCreateOAuthClient({
      body: clientBody,
      headers: new Headers({ cookie }),
    });
    expect(created.client_id).toBeTruthy();
    expect(created.client_secret).toBeTruthy();

    const [row] = await db
      .select({ secret: oauthClients.clientSecret })
      .from(oauthClients)
      .where(eq(oauthClients.clientId, created.client_id));
    expect(row?.secret).toBeTruthy();
    expect(row?.secret).not.toBe(created.client_secret);

    expect((await listOAuthClients(db)).map((c) => c.clientId)).toContain(created.client_id);
    expect(await getOAuthClientPublicInfo(db, created.client_id)).toMatchObject({
      name: "Example client",
      disabled: false,
    });
  });
});
