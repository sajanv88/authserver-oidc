import { sql } from "drizzle-orm";
import type { Executor } from "../executor";

// Whether the database answers, for the readiness probe. One `select 1`, given a time limit, so
// a database that hangs makes the pod unready. The time limit only stops the wait: the query
// itself runs on until the driver gives up. So there's at most one at a time per database: a
// call while one is still running, past its own time limit or not, waits on that one, and
// probes never pile hung queries up on the pool. A query that never settles is shared for
// PING_SHARE_MS at most, then a new one starts: once the database is back, the pod is ready
// again, and a hung database costs one connection every 30 seconds, not one per probe.

export const PING_TIMEOUT_MS = 2000;
export const PING_SHARE_MS = 30_000;

export type DatabasePing =
  | { ok: true }
  /**
   * `code` is the driver's or Postgres's error code (`ECONNREFUSED`, `57P03`, …) when it has a
   * plain one, never its message, which can carry the host or the user.
   */
  | { ok: false; reason: "timeout" }
  | { ok: false; reason: "failed"; code?: string };

/** The ping running against each database, until it settles, and when it started. */
const running = new WeakMap<Executor, { ping: Promise<DatabasePing>; startedAt: number }>();

export async function pingDatabase(
  db: Executor,
  timeoutMs: number = PING_TIMEOUT_MS,
  shareMs: number = PING_SHARE_MS,
): Promise<DatabasePing> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DatabasePing>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  let entry = running.get(db);
  if (!entry || Date.now() - entry.startedAt >= shareMs) {
    const ping = db
      .execute(sql`select 1`)
      .then(
        (): DatabasePing => ({ ok: true }),
        (error: unknown): DatabasePing => {
          const code = errorCode(error);
          return code === undefined
            ? { ok: false, reason: "failed" }
            : { ok: false, reason: "failed", code };
        },
      )
      .finally(() => {
        if (running.get(db) === started) running.delete(db);
      });
    const started = { ping, startedAt: Date.now() };
    running.set(db, started);
    entry = started;
  }
  try {
    return await Promise.race([entry.ping, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** A short, plain error code from the error or what caused it (drizzle wraps the driver's). */
function errorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 3; depth++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
