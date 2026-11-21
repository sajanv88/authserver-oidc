import { beforeAll, describe, expect, it } from "vitest";
import { sessions } from "../schema/sessions";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { getSessionToken, listActiveSessions } from "./sessions";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const now = new Date("2026-11-21T12:00:00Z");
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe("sessions queries", () => {
  let db: TestDb;
  let ada = "";
  let grace = "";
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const inserted = await db
      .insert(users)
      .values([
        { email: "ada@example.com", name: "Ada" },
        { email: "grace@example.com", name: "Grace" },
      ])
      .returning({ id: users.id });
    ada = inserted[0]?.id ?? "";
    grace = inserted[1]?.id ?? "";
    const rows = await db
      .insert(sessions)
      .values([
        { token: "laptop", userId: ada, expiresAt: hours(24), updatedAt: hours(-5) },
        { token: "phone", userId: ada, expiresAt: hours(24), updatedAt: hours(-1) },
        { token: "old", userId: ada, expiresAt: hours(-1), updatedAt: hours(-30) },
        { token: "grace", userId: grace, expiresAt: hours(24) },
      ])
      .returning({ id: sessions.id, token: sessions.token });
    for (const row of rows) ids[row.token] = row.id;
  });

  it("listActiveSessions: the user's unexpired sessions, most recent first, without tokens", async () => {
    const list = await listActiveSessions(db, ada, now);
    expect(list.map((s) => s.id)).toEqual([ids.phone, ids.laptop]);
    expect(Object.keys(list[0] ?? {}).sort()).toEqual([
      "createdAt",
      "expiresAt",
      "id",
      "ipAddress",
      "updatedAt",
      "userAgent",
    ]);
  });

  it("getSessionToken finds only the user's own session", async () => {
    expect(await getSessionToken(db, ada, ids.phone ?? "")).toBe("phone");
    expect(await getSessionToken(db, ada, ids.grace ?? "")).toBeUndefined();
    expect(await getSessionToken(db, grace, ids.phone ?? "")).toBeUndefined();
  });
});
