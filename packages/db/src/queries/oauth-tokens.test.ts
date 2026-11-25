import { beforeAll, describe, expect, it } from "vitest";
import { oauthAccessTokens } from "../schema/oauth-access-tokens";
import { oauthClients } from "../schema/oauth-clients";
import { oauthRefreshTokens } from "../schema/oauth-refresh-tokens";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { revokeUserOAuthTokens } from "./oauth-tokens";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("revokeUserOAuthTokens", () => {
  let db: TestDb;
  let ada = "";
  let grace = "";
  const earlier = new Date("2026-11-01T00:00:00Z");
  const now = new Date("2026-11-25T12:00:00Z");
  const expiresAt = new Date("2026-12-25T00:00:00Z");

  beforeAll(async () => {
    db = await createTestDb();
    const [a, g] = await db
      .insert(users)
      .values([
        { email: "ada@example.com", name: "Ada" },
        { email: "grace@example.com", name: "Grace" },
      ])
      .returning({ id: users.id });
    ada = a?.id ?? "";
    grace = g?.id ?? "";
    await db.insert(oauthClients).values({ clientId: "app", redirectUris: [] });
    const token = (userId: string, name: string, revoked: Date | null = null) => ({
      token: name,
      clientId: "app",
      userId,
      scopes: ["openid", "offline_access"],
      expiresAt,
      revoked,
    });
    await db
      .insert(oauthRefreshTokens)
      .values([token(ada, "r1"), token(ada, "r2", earlier), token(grace, "r3")]);
    await db.insert(oauthAccessTokens).values([token(ada, "a1"), token(grace, "a2")]);
  });

  it("revokes the user's live tokens, keeps earlier revocations, and leaves others alone", async () => {
    expect(await revokeUserOAuthTokens(db, ada, now)).toBe(2);

    const refresh = await db.query.oauthRefreshTokens.findMany({
      columns: { token: true, revoked: true },
    });
    expect(Object.fromEntries(refresh.map((t) => [t.token, t.revoked]))).toEqual({
      r1: now,
      r2: earlier,
      r3: null,
    });
    const access = await db.query.oauthAccessTokens.findMany({
      columns: { token: true, revoked: true },
    });
    expect(Object.fromEntries(access.map((t) => [t.token, t.revoked]))).toEqual({
      a1: now,
      a2: null,
    });

    expect(await revokeUserOAuthTokens(db, ada, now)).toBe(0);
  });
});
