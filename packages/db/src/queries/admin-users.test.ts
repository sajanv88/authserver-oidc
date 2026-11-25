import { beforeAll, describe, expect, it } from "vitest";
import { sessions } from "../schema/sessions";
import { twoFactors } from "../schema/two-factors";
import { users } from "../schema/users";
import { createTestDb } from "../testing/pglite";
import {
  countUsers,
  getUserDetail,
  listUsers,
  resetTwoFactor,
  setTwoFactorRequired,
  userStatus,
} from "./admin-users";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const now = new Date("2026-11-25T12:00:00Z");
const day = 24 * 60 * 60 * 1000;
const at = (offsetDays: number) => new Date(now.getTime() + offsetDays * day);
const missing = "00000000-0000-4000-8000-000000000000";

describe("admin user queries", () => {
  let db: TestDb;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await createTestDb();
    const rows = await db
      .insert(users)
      .values([
        { email: "ada@example.com", name: "Ada Lovelace", emailVerified: true, createdAt: at(-5) },
        { email: "grace@example.com", name: "Grace", emailVerified: true, createdAt: at(-4) },
        { email: "new@example.com", name: "Not Yet", emailVerified: false, createdAt: at(-3) },
        {
          email: "gone@example.com",
          name: "Disabled",
          emailVerified: true,
          banned: true,
          banReason: "left the company",
          createdAt: at(-2),
        },
        {
          email: "back@example.com",
          name: "Was_Disabled",
          emailVerified: true,
          banned: true,
          banExpires: at(-1),
          createdAt: at(-1),
        },
      ])
      .returning({ id: users.id, email: users.email });
    for (const row of rows) ids[row.email.split("@")[0] ?? ""] = row.id;

    await db.insert(sessions).values([
      { token: "a1", userId: ids.ada ?? "", expiresAt: at(7), updatedAt: at(-2) },
      { token: "a2", userId: ids.ada ?? "", expiresAt: at(7), updatedAt: at(-1) },
    ]);
  });

  it("lists everyone newest first, with when they were last active", async () => {
    const list = await listUsers(db, { limit: 10, now });
    expect(list.map((u) => u.email)).toEqual([
      "back@example.com",
      "gone@example.com",
      "new@example.com",
      "grace@example.com",
      "ada@example.com",
    ]);
    expect(list.find((u) => u.email === "ada@example.com")?.lastActiveAt).toEqual(at(-1));
    expect(list.find((u) => u.email === "grace@example.com")?.lastActiveAt).toBeNull();
    expect(await countUsers(db, { now })).toBe(5);
  });

  it("pages", async () => {
    const second = await listUsers(db, { limit: 2, offset: 2, now });
    expect(second.map((u) => u.email)).toEqual(["new@example.com", "grace@example.com"]);
  });

  it("finds people by part of their name or email, any case, with wildcards taken literally", async () => {
    expect((await listUsers(db, { limit: 10, search: "LOVE" })).map((u) => u.email)).toEqual([
      "ada@example.com",
    ]);
    expect((await listUsers(db, { limit: 10, search: "grace@" })).map((u) => u.email)).toEqual([
      "grace@example.com",
    ]);
    // "_" would match any one character in LIKE: here it only matches itself.
    expect((await listUsers(db, { limit: 10, search: "was_" })).map((u) => u.email)).toEqual([
      "back@example.com",
    ]);
    expect(await countUsers(db, { search: "%" })).toBe(0);
  });

  it("filters by status: a disabled account whose end date has passed is active again", async () => {
    const emails = async (status: "active" | "disabled" | "unconfirmed") =>
      (await listUsers(db, { limit: 10, status, now })).map((u) => u.email);
    expect(await emails("disabled")).toEqual(["gone@example.com"]);
    expect(await emails("unconfirmed")).toEqual(["new@example.com"]);
    expect(await emails("active")).toEqual([
      "back@example.com",
      "grace@example.com",
      "ada@example.com",
    ]);
    expect(await countUsers(db, { status: "disabled", now })).toBe(1);
  });

  it("tells where an account stands", () => {
    expect(userStatus({ banned: true, banExpires: null, emailVerified: true }, now)).toBe(
      "disabled",
    );
    expect(userStatus({ banned: true, banExpires: at(1), emailVerified: true }, now)).toBe(
      "disabled",
    );
    expect(userStatus({ banned: true, banExpires: at(-1), emailVerified: true }, now)).toBe(
      "active",
    );
    expect(userStatus({ banned: false, banExpires: null, emailVerified: false }, now)).toBe(
      "unconfirmed",
    );
  });

  it("reads one user with the reason they're disabled", async () => {
    expect(await getUserDetail(db, ids.gone ?? "")).toMatchObject({
      email: "gone@example.com",
      banned: true,
      banReason: "left the company",
      lastActiveAt: null,
    });
    expect(await getUserDetail(db, missing)).toBeUndefined();
  });

  it("requires two-factor of a user, or stops requiring it", async () => {
    expect(await setTwoFactorRequired(db, ids.grace ?? "", true)).toBe(true);
    expect(await getUserDetail(db, ids.grace ?? "")).toMatchObject({ twoFactorRequired: true });
    expect(await setTwoFactorRequired(db, ids.grace ?? "", false)).toBe(true);
    expect(await setTwoFactorRequired(db, missing, true)).toBe(false);
  });

  it("resets two-factor: the secret goes and the flag is cleared", async () => {
    const id = ids.ada ?? "";
    await db.update(users).set({ twoFactorEnabled: true });
    await db.insert(twoFactors).values({ userId: id, secret: "s", backupCodes: "b" });

    expect(await resetTwoFactor(db, id)).toBe(true);
    expect(await getUserDetail(db, id)).toMatchObject({ twoFactorEnabled: false });
    expect(await db.query.twoFactors.findMany({ where: { userId: id } })).toEqual([]);
    // Someone else's stays on.
    expect(await getUserDetail(db, ids.grace ?? "")).toMatchObject({ twoFactorEnabled: true });
    expect(await resetTwoFactor(db, missing)).toBe(false);
  });
});
