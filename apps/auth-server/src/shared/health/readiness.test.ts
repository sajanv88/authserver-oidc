import { type DatabasePing, pingDatabase } from "@repo/db";
import { createTestDb } from "@repo/db/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadiness } from "./readiness";

describe("the readiness probe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is ready while the database answers", async () => {
    const database = await createTestDb();
    const response = await createReadiness(() => pingDatabase(database))();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it.each<[DatabasePing, string]>([
    [{ ok: false, reason: "failed", code: "ECONNREFUSED" }, "failed (ECONNREFUSED)"],
    [{ ok: false, reason: "failed" }, "failed"],
    [{ ok: false, reason: "timeout" }, "timeout"],
  ])("is unavailable, with no detail, when the ping says %j", async (ping, logged) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await createReadiness(async () => ping)();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "unavailable" });
    expect(warn).toHaveBeenCalledWith(`readiness: the database didn't answer: ${logged}`);
  });

  it("asks the database at most once a second, however many call", async () => {
    let clock = 0;
    const ping = vi.fn(async (): Promise<DatabasePing> => ({ ok: true }));
    const readiness = createReadiness(ping, { now: () => clock });
    await Promise.all(Array.from({ length: 20 }, () => readiness()));
    clock = 999;
    expect((await readiness()).status).toBe(200);
    expect(ping).toHaveBeenCalledTimes(1);
    clock = 1000;
    await readiness();
    expect(ping).toHaveBeenCalledTimes(2);
  });
});
