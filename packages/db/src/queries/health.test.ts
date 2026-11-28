import { describe, expect, it, vi } from "vitest";
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

  it("runs one query at a time, even past the time limit: later calls wait on it", async () => {
    let finish: (value: unknown) => void = () => {};
    const execute = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const slow = executor(execute);
    const together = await Promise.all([pingDatabase(slow, 20), pingDatabase(slow, 20)]);
    expect(together).toEqual([
      { ok: false, reason: "timeout" },
      { ok: false, reason: "timeout" },
    ]);
    // Still hung: a new call starts no second query.
    expect(await pingDatabase(slow, 20)).toEqual({ ok: false, reason: "timeout" });
    expect(execute).toHaveBeenCalledTimes(1);
    // Once it answers, the next call asks again.
    finish(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await pingDatabase(slow, 20)).toEqual({ ok: false, reason: "timeout" });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("shares a query that never settles for a while only, then asks again", async () => {
    const execute = vi.fn(() => new Promise(() => {}));
    const stuck = executor(execute);
    expect(await pingDatabase(stuck, 10, 50)).toEqual({ ok: false, reason: "timeout" });
    expect(await pingDatabase(stuck, 10, 50)).toEqual({ ok: false, reason: "timeout" });
    expect(execute).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(await pingDatabase(stuck, 10, 50)).toEqual({ ok: false, reason: "timeout" });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
