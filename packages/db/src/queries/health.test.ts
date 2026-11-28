import { describe, expect, it } from "vitest";
import type { Executor } from "../executor";
import { createTestDb } from "../testing/pglite";
import { pingDatabase } from "./health";

/** An executor whose queries do what `execute` says: the only call pingDatabase makes. */
const executor = (execute: () => Promise<unknown>) => ({ execute }) as unknown as Executor;

describe("pingDatabase", () => {
  it("is ok when the database answers", async () => {
    expect(await pingDatabase(await createTestDb())).toEqual({ ok: true });
  });

  it("reports a failure by its code only, never the message", async () => {
    const refused = Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:5432 user=app"), {
      code: "ECONNREFUSED",
    });
    // drizzle wraps the driver's error; the code is on its cause.
    const wrapped = new Error("Failed query: select 1", { cause: refused });
    expect(await pingDatabase(executor(() => Promise.reject(wrapped)))).toEqual({
      ok: false,
      reason: "failed",
      code: "ECONNREFUSED",
    });
    expect(await pingDatabase(executor(() => Promise.reject(new Error("x"))))).toEqual({
      ok: false,
      reason: "failed",
    });
    const odd = Object.assign(new Error("x"), { code: "not a code: postgres://u:p@h" });
    expect(await pingDatabase(executor(() => Promise.reject(odd)))).toEqual({
      ok: false,
      reason: "failed",
    });
  });

  it("gives up after the time limit", async () => {
    const hangs = executor(() => new Promise(() => {}));
    const started = Date.now();
    expect(await pingDatabase(hangs, 50)).toEqual({ ok: false, reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
