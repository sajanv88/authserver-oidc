import { beforeAll, describe, expect, it } from "vitest";
import { accounts } from "../schema/accounts";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import { getSignInMethods } from "./accounts";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

describe("accounts queries", () => {
  let db: TestDb;
  let ada = "";
  let grace = "";

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
    await db.insert(accounts).values([
      { userId: ada, providerId: "credential", accountId: ada, password: "hash" },
      { userId: ada, providerId: "sso", accountId: "ada-at-sso" },
      { userId: ada, providerId: "github", accountId: "1001" },
      { userId: grace, providerId: "google", accountId: "g-1" },
    ]);
  });

  it("getSignInMethods: whether there's a password, and the providers, sorted", async () => {
    expect(await getSignInMethods(db, ada)).toEqual({
      hasPassword: true,
      providers: ["github", "sso"],
    });
    expect(await getSignInMethods(db, grace)).toEqual({
      hasPassword: false,
      providers: ["google"],
    });
  });
});
