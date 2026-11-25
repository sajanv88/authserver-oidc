import { beforeAll, describe, expect, it } from "vitest";
import { oauthClients } from "../schema/oauth-clients";
import { oauthPushedRequests } from "../schema/oauth-pushed-requests";
import { createTestDb } from "../testing/pglite";
import { consumePushedRequest, createPushedRequest } from "./oauth-pushed-requests";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const now = new Date("2026-11-25T12:00:00Z");
const seconds = (n: number) => new Date(now.getTime() + n * 1000);
const parameters = { response_type: "code", client_id: "app", redirect_uri: "https://a/cb" };

describe("pushed authorization requests", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(oauthClients).values([
      { clientId: "app", redirectUris: ["https://a/cb"] },
      { clientId: "other", redirectUris: ["https://b/cb"] },
    ]);
  });

  it("hands a request back once, to the client that pushed it", async () => {
    await createPushedRequest(
      db,
      { requestUriHash: "h1", clientId: "app", parameters, expiresAt: seconds(60) },
      now,
    );
    expect(await consumePushedRequest(db, { requestUriHash: "h1", clientId: "other" }, now)).toBe(
      undefined,
    );
    expect(await consumePushedRequest(db, { requestUriHash: "h1", clientId: "app" }, now)).toEqual(
      parameters,
    );
    expect(await consumePushedRequest(db, { requestUriHash: "h1", clientId: "app" }, now)).toBe(
      undefined,
    );
  });

  it("doesn't hand back an expired request, and drops it on the next push or use", async () => {
    await createPushedRequest(
      db,
      { requestUriHash: "h2", clientId: "app", parameters, expiresAt: seconds(60) },
      now,
    );
    await createPushedRequest(
      db,
      { requestUriHash: "h2b", clientId: "app", parameters, expiresAt: seconds(30) },
      now,
    );
    expect(
      await consumePushedRequest(db, { requestUriHash: "h2", clientId: "app" }, seconds(61)),
    ).toBe(undefined);
    // That use swept both expired rows, the one it asked for and the other.
    expect(await db.select().from(oauthPushedRequests)).toEqual([]);
    await createPushedRequest(
      db,
      { requestUriHash: "h3", clientId: "app", parameters, expiresAt: seconds(200) },
      seconds(120),
    );
    const left = await db
      .select({ hash: oauthPushedRequests.requestUriHash })
      .from(oauthPushedRequests);
    expect(left.map((row) => row.hash)).toEqual(["h3"]);
  });

  it("goes with its client", async () => {
    await createPushedRequest(
      db,
      { requestUriHash: "h4", clientId: "other", parameters, expiresAt: seconds(300) },
      now,
    );
    await db.delete(oauthClients);
    expect(await db.select().from(oauthPushedRequests)).toEqual([]);
  });
});
