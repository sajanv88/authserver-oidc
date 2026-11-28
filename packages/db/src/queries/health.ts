import { sql } from "drizzle-orm";
import type { Executor } from "../executor";

// Whether the database answers, for the readiness probe. One `select 1`, given a time limit, so
// a database that hangs makes the pod unready instead of piling probes up on the pool.

export const PING_TIMEOUT_MS = 2000;

export type DatabasePing =
  | { ok: true }
  /**
   * `code` is the driver's or Postgres's error code (`ECONNREFUSED`, `57P03`, …) when it has a
   * plain one, never its message, which can carry the host or the user.
   */
  | { ok: false; reason: "timeout" }
  | { ok: false; reason: "failed"; code?: string };

export async function pingDatabase(
  db: Executor,
  timeoutMs: number = PING_TIMEOUT_MS,
): Promise<DatabasePing> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<DatabasePing>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout" }), timeoutMs);
  });
  const ping = db.execute(sql`select 1`).then(
    (): DatabasePing => ({ ok: true }),
    (error: unknown): DatabasePing => {
      const code = errorCode(error);
      return code === undefined
        ? { ok: false, reason: "failed" }
        : { ok: false, reason: "failed", code };
    },
  );
  try {
    return await Promise.race([ping, timeout]);
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
