import { beforeAll, describe, expect, it } from "vitest";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { getUserSecurityByEmail, updateUserAccess } from "./users";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("users queries", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    await db.insert(users).values([
      { email: "ada@example.com", name: "Ada", emailVerified: true, twoFactorEnabled: true },
      { email: "grace@example.com", name: "Grace", role: "admin" },
    ]);
  });

  it("getUserSecurityByEmail returns only the security flags", async () => {
    const ada = await getUserSecurityByEmail(db, "ada@example.com");
    expect(ada).toMatchObject({ emailVerified: true, twoFactorEnabled: true, role: "user" });
    expect(Object.keys(ada ?? {}).sort()).toEqual([
      "emailVerified",
      "id",
      "role",
      "twoFactorEnabled",
    ]);
  });

  it("matches the email the way Better Auth stores it (trimmed, lowercased)", async () => {
    expect(await getUserSecurityByEmail(db, "  Grace@Example.COM ")).toMatchObject({
      role: "admin",
      twoFactorEnabled: false,
    });
  });

  it("returns undefined for an unknown email", async () => {
    expect(await getUserSecurityByEmail(db, "nobody@example.com")).toBeUndefined();
  });

  it("updateUserAccess sets the role and confirmation by email, or finds nobody", async () => {
    expect(
      await updateUserAccess(db, " ADA@example.com", { role: "admin", emailVerified: true }),
    ).toMatchObject({ role: "admin", emailVerified: true, twoFactorEnabled: true });
    expect(await getUserSecurityByEmail(db, "ada@example.com")).toMatchObject({ role: "admin" });
    expect(
      await updateUserAccess(db, "nobody@example.com", { role: "admin", emailVerified: true }),
    ).toBeUndefined();
  });
});
