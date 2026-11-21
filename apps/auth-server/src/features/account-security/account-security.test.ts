// The account-security feature against the real auth configuration (PGlite): its form rules,
// the requests ChangePasswordForm makes, and the server functions the session actions call.
import * as v from "valibot";
import { beforeAll, describe, expect, it } from "vitest";
import { createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { ChangePasswordSchema, crossFieldErrors, SessionIdSchema } from "./schemas/account";
import { revokeSession, signOutEverywhere, toSessionRow } from "./server/sessions";
import { describeDevice } from "./server/user-agent";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const newPassword = "a brand new passphrase";

describe("account-security rules", () => {
  it("asks for the current password and a new one, typed twice, that's actually new", () => {
    expect(
      parseForm(ChangePasswordSchema, {
        currentPassword: "",
        newPassword: "short",
        confirmPassword: "",
      }),
    ).toEqual({
      ok: false,
      errors: {
        currentPassword: "Enter your password.",
        newPassword: "Use at least 12 characters.",
        confirmPassword: "Type the new password again.",
      },
    });
    expect(
      crossFieldErrors({
        currentPassword: password,
        newPassword: password,
        confirmPassword: password,
      }),
    ).toEqual({ newPassword: "Choose a password different from the current one." });
    expect(
      crossFieldErrors({ currentPassword: password, newPassword, confirmPassword: "other" }),
    ).toEqual({ confirmPassword: "The passwords don't match. Type the same password twice." });
    expect(
      crossFieldErrors({ currentPassword: password, newPassword, confirmPassword: newPassword }),
    ).toEqual({});
  });

  it("names devices people will recognise", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      ),
    ).toEqual({ kind: "computer", label: "Safari on macOS" });
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ kind: "phone", label: "Chrome on iPhone" });
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0",
      ),
    ).toEqual({ kind: "computer", label: "Edge on Windows" });
    expect(describeDevice(null)).toEqual({ kind: "unknown", label: "Unknown device" });
  });

  it("lists a session without its token, marking this one", () => {
    const at = new Date("2026-11-21T10:00:00Z");
    const summary = {
      id: "s1",
      ipAddress: "203.0.113.9",
      userAgent: null,
      createdAt: at,
      updatedAt: at,
      expiresAt: at,
    };
    expect(toSessionRow(summary, "s1")).toEqual({
      id: "s1",
      device: { kind: "unknown", label: "Unknown device" },
      ipAddress: "203.0.113.9",
      signedInAt: "2026-11-21T10:00:00.000Z",
      lastActiveAt: "2026-11-21T10:00:00.000Z",
      current: true,
    });
    expect(toSessionRow(summary, "s2").current).toBe(false);
    // The id a "Sign out" button sends: a uuid, nothing else.
    expect(v.is(SessionIdSchema, "0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(v.is(SessionIdSchema, "' or 1=1 --")).toBe(false);
  });
});

describe("securing the account", () => {
  let h: Harness;

  const cookies = (browser: Browser) =>
    new Headers({ cookie: [...browser.jar].map(([name, value]) => `${name}=${value}`).join("; ") });

  async function signUp(email: string, ip: string): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    return browser;
  }

  async function signIn(email: string, ip: string, pass = password): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-in/email", { json: { email, password: pass } });
    return browser;
  }

  const sessionOf = (browser: Browser) => h.auth.api.getSession({ headers: cookies(browser) });

  async function sessionId(browser: Browser): Promise<string> {
    const session = await sessionOf(browser);
    if (!session) throw new Error("expected a session");
    return session.session.id;
  }

  beforeAll(async () => {
    h = await createHarness();
  });

  it("changing the password needs the current one, then signs out every other device", async () => {
    const laptop = await signUp("ada@example.com", "203.0.113.140");
    const phone = await signIn("ada@example.com", "203.0.113.141");

    const wrong = await laptop.request("POST", "/api/auth/change-password", {
      json: { currentPassword: "not my password", newPassword, revokeOtherSessions: true },
    });
    // The code ChangePasswordForm turns into "That isn't your current password."
    expect(((await wrong.json()) as { code?: string }).code).toBe("INVALID_PASSWORD");

    const changed = await laptop.request("POST", "/api/auth/change-password", {
      json: { currentPassword: password, newPassword, revokeOtherSessions: true },
    });
    expect(changed.status).toBe(200);
    expect(await sessionOf(laptop)).not.toBeNull();
    expect(await sessionOf(phone)).toBeNull();

    const old = await h.browser("203.0.113.142").request("POST", "/api/auth/sign-in/email", {
      json: { email: "ada@example.com", password },
    });
    expect(old.status).toBe(401);
    expect(
      await sessionOf(await signIn("ada@example.com", "203.0.113.143", newPassword)),
    ).not.toBeNull();
  });

  it("limits password changes to 5 tries in 5 minutes", async () => {
    const browser = await signUp("limited@example.com", "203.0.113.144");
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await browser.request("POST", "/api/auth/change-password", {
        json: { currentPassword: "not my password", newPassword },
      });
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 5).every((status) => status !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
  });

  it("signs out one other session of the user's own, and nothing else", async () => {
    const laptop = await signUp("grace@example.com", "203.0.113.150");
    const phone = await signIn("grace@example.com", "203.0.113.151");
    const stranger = await signUp("alan@example.com", "203.0.113.152");
    const laptopSession = await h.auth.api.getSession({ headers: cookies(laptop) });
    if (!laptopSession) throw new Error("expected a session");
    const who = { userId: laptopSession.user.id, currentSessionId: laptopSession.session.id };

    // Not this session: that's what "Sign out" is for.
    expect(
      await revokeSession(h.auth, cookies(laptop), h.database, who, who.currentSessionId),
    ).toEqual({ ok: false, problem: "current" });
    // Not someone else's.
    expect(
      await revokeSession(h.auth, cookies(laptop), h.database, who, await sessionId(stranger)),
    ).toEqual({ ok: false, problem: "not-found" });
    expect(await sessionOf(stranger)).not.toBeNull();

    expect(
      await revokeSession(h.auth, cookies(laptop), h.database, who, await sessionId(phone)),
    ).toEqual({ ok: true });
    expect(await sessionOf(phone)).toBeNull();
    expect(await sessionOf(laptop)).not.toBeNull();
  });

  it("signs out everywhere, this session included", async () => {
    const laptop = await signUp("katherine@example.com", "203.0.113.160");
    const phone = await signIn("katherine@example.com", "203.0.113.161");
    expect(await signOutEverywhere(h.auth, cookies(laptop))).toBe(true);
    expect(await sessionOf(laptop)).toBeNull();
    expect(await sessionOf(phone)).toBeNull();
    // Without a session there's nothing to sign out of.
    expect(await signOutEverywhere(h.auth, cookies(laptop))).toBe(false);
  });
});
