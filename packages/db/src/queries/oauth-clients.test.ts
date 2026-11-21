import { beforeAll, describe, expect, it } from "vitest";
import { oauthClients } from "../schema/oauth-clients";
import { createTestDb } from "../testing/pglite";
import { getOAuthClientPublicInfo, listOAuthClients } from "./oauth-clients";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const redirectUris = ["https://app.example.com/callback"];

describe("oauth client queries", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    const base = Date.UTC(2026, 0, 1);
    await db.insert(oauthClients).values([
      { clientId: "first", name: "First", redirectUris, createdAt: new Date(base) },
      {
        clientId: "second",
        name: "Second",
        clientSecret: "hashed-secret",
        tokenEndpointAuthMethod: "client_secret_basic",
        redirectUris,
        createdAt: new Date(base + 1000),
      },
      {
        clientId: "third",
        name: "Third",
        tokenEndpointAuthMethod: "none",
        uri: "https://third.example.com",
        redirectUris,
        createdAt: new Date(base + 2000),
      },
    ]);
  });

  it("listOAuthClients is newest first and honours limit and offset", async () => {
    expect((await listOAuthClients(db)).map((c) => c.clientId)).toEqual([
      "third",
      "second",
      "first",
    ]);
    expect((await listOAuthClients(db, { limit: 1, offset: 1 })).map((c) => c.clientId)).toEqual([
      "second",
    ]);
  });

  it("listOAuthClients never returns the secret", async () => {
    const [row] = await listOAuthClients(db, { limit: 1 });
    expect(Object.keys(row ?? {}).sort()).toEqual([
      "clientId",
      "createdAt",
      "disabled",
      "id",
      "name",
      "redirectUris",
      "scopes",
      "tokenEndpointAuthMethod",
    ]);
  });

  it("getOAuthClientPublicInfo returns public metadata, or undefined", async () => {
    expect(await getOAuthClientPublicInfo(db, "third")).toEqual({
      clientId: "third",
      name: "Third",
      uri: "https://third.example.com",
      icon: null,
      policy: null,
      tos: null,
      disabled: false,
    });
    expect(await getOAuthClientPublicInfo(db, "missing")).toBeUndefined();
  });

  it("works inside a transaction (the executor can be tx)", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(oauthClients).values({ clientId: "temp", redirectUris });
        expect(await getOAuthClientPublicInfo(tx, "temp")).toBeDefined();
        tx.rollback();
      }),
    ).rejects.toThrow();
    expect(await getOAuthClientPublicInfo(db, "temp")).toBeUndefined();
  });
});
