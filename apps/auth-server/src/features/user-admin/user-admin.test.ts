// The user-admin feature against the real auth configuration (PGlite): its form rules, and the
// server functions its actions call, driven with an admin's browser as the actions drive them.

import { listAdminActions } from "@repo/db";
import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { DeleteUserSchema, DisableUserSchema } from "./schemas/users";
import {
  type AdminDeps,
  changeRole,
  deleteUser,
  disableUser,
  enableUser,
  requireTwoFactor,
  resetUserTwoFactor,
  signOutUser,
} from "./server/manage";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const password = "correct horse battery staple";
const missing = "00000000-0000-4000-8000-000000000000";

describe("user-admin form rules", () => {
  const userId = "6f1c1a1e-2b3c-4d5e-8f90-123456789abc";

  it("takes a short one-line reason and a period", () => {
    expect(parseForm(DisableUserSchema, { userId, reason: "  left  ", period: "7d" })).toEqual({
      ok: true,
      value: { userId, reason: "left", period: "7d" },
    });
    expect(
      parseForm(DisableUserSchema, { userId, reason: "x".repeat(201), period: "year" }),
    ).toEqual({
      ok: false,
      errors: { reason: "Keep the reason under 200 characters.", period: "Choose how long." },
    });
    expect(parseForm(DisableUserSchema, { userId, reason: "a\nb", period: "1d" })).toMatchObject({
      ok: false,
      errors: { reason: "Write the reason on one line." },
    });
  });

  it("needs the email typed to delete, in any case", () => {
    expect(parseForm(DeleteUserSchema, { userId, confirmation: " Ada@Example.com " })).toEqual({
      ok: true,
      value: { userId, confirmation: "ada@example.com" },
    });
    expect(parseForm(DeleteUserSchema, { userId: "not-an-id", confirmation: "" })).toMatchObject({
      ok: false,
      errors: { confirmation: "Type the email address to confirm." },
    });
  });
});

describe("managing users", () => {
  let h: Harness;
  let deps: AdminDeps;
  let nextIp = 1;

  /** Signs someone up and confirms the address; returns their id and a signed-in browser. */
  async function person(email: string) {
    const browser = h.browser(`198.51.100.${nextIp++}`);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: email.split("@")[0] },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    const { rows } = await h.sql("select id from users where email = $1", [email]);
    return { id: (rows[0] as { id: string }).id, email, browser };
  }

  const signIn = (email: string) =>
    h.browser(`198.51.100.${nextIp++}`).request("POST", "/api/auth/sign-in/email", {
      json: { email, password },
    });

  /** The emails sent to `to` since `before`. */
  async function mailTo(to: string, before: number) {
    await h.settled();
    return h.emails.slice(before).filter((email) => email.to === to);
  }

  const history = async (id: string) =>
    (await listAdminActions(h.database, id)).map((e) => [e.action, e.detail]);

  beforeAll(async () => {
    h = await createHarness();
    const admin = await person("admin@example.com");
    await h.sql("update users set role = 'admin' where id = $1", [admin.id]);
    deps = {
      call: admin.browser.caller(),
      db: h.database,
      actor: { userId: admin.id },
      sendEmail: h.sendEmail,
      env: h.env,
    };
  });

  it("disables an account for a while: no sign-in, an email with the date, a history entry", async () => {
    const ada = await person("ada@example.com");
    const before = h.emails.length;

    expect(await disableUser(deps, { userId: ada.id, reason: "left", period: "7d" })).toEqual({
      ok: true,
    });

    expect((await signIn(ada.email)).status).toBe(403);
    const [email] = await mailTo(ada.email, before);
    expect(email?.subject).toContain("Your account has been disabled");
    expect(email?.text).toMatch(/You can sign in again from \d+ \w+ \d{4}/);
    expect(email?.text).not.toContain("left");
    const [[action, detail]] = (await history(ada.id)) as [[string, string]];
    expect(action).toBe("user.disable");
    expect(new Date(detail).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
    const { rows } = await h.sql("select ban_reason from users where id = $1", [ada.id]);
    expect(rows).toEqual([{ ban_reason: "left" }]);
  });

  it("enables it again, and says so only to someone who was disabled", async () => {
    const { rows } = await h.sql("select id from users where email = 'ada@example.com'");
    const ada = (rows[0] as { id: string }).id;
    const before = h.emails.length;

    expect(await enableUser(deps, ada)).toEqual({ ok: true });
    expect((await signIn("ada@example.com")).status).toBe(200);
    expect((await mailTo("ada@example.com", before))[0]?.subject).toContain(
      "Your account is enabled again",
    );

    const after = h.emails.length;
    expect(await enableUser(deps, ada)).toEqual({ ok: true });
    expect(await mailTo("ada@example.com", after)).toEqual([]);
  });

  it("never acts on the admin's own account, or on one that's gone", async () => {
    const own = deps.actor.userId;
    expect(await disableUser(deps, { userId: own, reason: "", period: "forever" })).toEqual({
      ok: false,
      problem: "self",
    });
    expect(await signOutUser(deps, own)).toEqual({ ok: false, problem: "self" });
    expect(await changeRole(deps, { userId: own, role: "user" })).toEqual({
      ok: false,
      problem: "self",
    });
    expect(await deleteUser(deps, { userId: own, confirmation: "admin@example.com" })).toEqual({
      ok: false,
      problem: "self",
    });
    expect(await enableUser(deps, missing)).toEqual({ ok: false, problem: "not-found" });
  });

  it("refuses an admin whose session isn't an admin's any more", async () => {
    const grace = await person("grace@example.com");
    const someone = await person("someone@example.com");
    const asSomeone = { ...deps, call: someone.browser.caller(), actor: { userId: someone.id } };
    expect(await signOutUser(asSomeone, grace.id)).toEqual({ ok: false, problem: "not-allowed" });
    expect(await history(grace.id)).toEqual([]);
  });

  it("signs someone out everywhere", async () => {
    const lin = await person("lin@example.com");
    expect(await signOutUser(deps, lin.id)).toEqual({ ok: true });
    const { rows } = await h.sql("select 1 from sessions where user_id = $1", [lin.id]);
    expect(rows).toEqual([]);
    expect(await history(lin.id)).toEqual([["user.sign_out", null]]);
  });

  it("makes someone an admin and a user again, recording each change once", async () => {
    const kim = await person("kim@example.com");
    expect(await changeRole(deps, { userId: kim.id, role: "admin" })).toEqual({ ok: true });
    expect(await changeRole(deps, { userId: kim.id, role: "admin" })).toEqual({ ok: true });
    expect(await changeRole(deps, { userId: kim.id, role: "user" })).toEqual({ ok: true });
    expect(await history(kim.id)).toEqual([
      ["user.role", "user"],
      ["user.role", "admin"],
    ]);
  });

  it("requires two-factor of someone, and stops requiring it", async () => {
    const mo = await person("mo@example.com");
    expect(await requireTwoFactor(deps, { userId: mo.id, required: true })).toEqual({ ok: true });
    const { rows } = await h.sql("select two_factor_required from users where id = $1", [mo.id]);
    expect(rows).toEqual([{ two_factor_required: true }]);
    expect(await requireTwoFactor(deps, { userId: mo.id, required: false })).toEqual({ ok: true });
    expect(await history(mo.id)).toEqual([
      ["user.two_factor.unrequire", null],
      ["user.two_factor.require", null],
    ]);
  });

  it("resets two-factor for someone who lost their phone, and tells them", async () => {
    const jo = await person("jo@example.com");
    await h.sql(
      "update users set two_factor_enabled = true, two_factor_required = true where id = $1",
      [jo.id],
    );
    await h.sql("insert into two_factors (user_id, secret, backup_codes) values ($1, 's', 'b')", [
      jo.id,
    ]);
    const before = h.emails.length;

    expect(await resetUserTwoFactor(deps, jo.id)).toEqual({ ok: true });

    const { rows } = await h.sql(
      "select two_factor_enabled, (select count(*)::int from two_factors where user_id = $1) as secrets from users where id = $1",
      [jo.id],
    );
    expect(rows).toEqual([{ two_factor_enabled: false, secrets: 0 }]);
    const [email] = await mailTo(jo.email, before);
    expect(email?.subject).toContain("Two-factor authentication was turned off");
    expect(email?.text).toContain("set it up again the next time you sign in");
    expect(email?.text.split(/\s+/)).toContain(
      "http://auth.localtest.me:3000/account/security/two-factor",
    );
    expect(await history(jo.id)).toEqual([["user.two_factor.reset", null]]);
  });

  it("deletes an account only when its email is typed, and keeps the history", async () => {
    const pat = await person("pat@example.com");
    expect(await deleteUser(deps, { userId: pat.id, confirmation: "someone@example.com" })).toEqual(
      { ok: false, problem: "mismatch" },
    );
    const before = h.emails.length;

    expect(await deleteUser(deps, { userId: pat.id, confirmation: "pat@example.com" })).toEqual({
      ok: true,
    });

    const { rows } = await h.sql("select 1 from users where id = $1", [pat.id]);
    expect(rows).toEqual([]);
    expect((await mailTo(pat.email, before))[0]?.subject).toContain(
      "Your account has been deleted",
    );
    expect(await history(pat.id)).toEqual([["user.delete", null]]);
  });
});
