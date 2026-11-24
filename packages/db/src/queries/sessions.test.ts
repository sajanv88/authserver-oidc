import { beforeAll, describe, expect, it } from "vitest";
import { sessions } from "../schema/sessions";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { countActiveSessions, getSessionToken, listActiveSessions } from "./sessions";

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
    const list = await listActiveSessions(db, ada, { limit: 10, now });
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

  it("listActiveSessions puts `first` at the top, and pages with limit and offset", async () => {
    const first = await listActiveSessions(db, ada, { limit: 10, first: ids.laptop, now });
    expect(first.map((s) => s.id)).toEqual([ids.laptop, ids.phone]);
    const one = await listActiveSessions(db, ada, { limit: 1, first: ids.laptop, now });
    expect(one.map((s) => s.id)).toEqual([ids.laptop]);
    const two = await listActiveSessions(db, ada, { limit: 1, offset: 1, first: ids.laptop, now });
    expect(two.map((s) => s.id)).toEqual([ids.phone]);
    // Another user's session id changes nothing.
    const other = await listActiveSessions(db, ada, { limit: 10, first: ids.grace, now });
    expect(other.map((s) => s.id)).toEqual([ids.phone, ids.laptop]);
  });

  it("countActiveSessions counts the user's unexpired sessions", async () => {
    expect(await countActiveSessions(db, ada, now)).toBe(2);
    expect(await countActiveSessions(db, grace, now)).toBe(1);
  });

  it("getSessionToken finds only the user's own session", async () => {
    expect(await getSessionToken(db, ada, ids.phone ?? "")).toBe("phone");
    expect(await getSessionToken(db, ada, ids.grace ?? "")).toBeUndefined();
    expect(await getSessionToken(db, grace, ids.phone ?? "")).toBeUndefined();
  });
});
