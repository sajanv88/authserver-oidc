import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { listAdminActions, recordAdminAction } from "./admin-actions";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("admin actions", () => {
  let db: TestDb;
  let admin = "";
  let target = "";

  beforeAll(async () => {
    db = await createTestDb();
    const [a, t] = await db
      .insert(users)
      .values([
        { email: "admin@example.com", name: "The Admin", role: "admin" },
        { email: "ada@example.com", name: "Ada" },
      ])
      .returning({ id: users.id });
    admin = a?.id ?? "";
    target = t?.id ?? "";
  });

  it("records who did what, newest first, with the admin's name", async () => {
    await recordAdminAction(db, {
      action: "user.disable",
      targetUserId: target,
      actor: { userId: admin },
      detail: "2026-12-01T00:00:00.000Z",
    });
    await recordAdminAction(db, {
      action: "user.sign_out",
      targetUserId: target,
      actor: { clientId: "platform-backend" },
    });

    const history = await listAdminActions(db, target);
    expect(history.map((e) => [e.action, e.actorName, e.actorClientId])).toEqual([
      ["user.sign_out", null, "platform-backend"],
      ["user.disable", "The Admin", null],
    ]);
    expect(history[1]?.detail).toBe("2026-12-01T00:00:00.000Z");
  });

  it("keeps the history when the account and the admin are gone", async () => {
    await db.delete(users).where(eq(users.id, target));
    await db.delete(users).where(eq(users.id, admin));
    const history = await listAdminActions(db, target);
    expect(history).toHaveLength(2);
    expect(history.map((e) => e.actorUserId)).toEqual([null, null]);
  });
});
