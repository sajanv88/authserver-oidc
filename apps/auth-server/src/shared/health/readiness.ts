import "server-only";
import type { DatabasePing } from "@repo/db";

// The readiness probe's answer (/api/ready): ready only while the database answers, so a pod
// that can't reach it gets no traffic. Liveness and startup stay on /api/health, which touches
// nothing: a database outage must never restart pods. The endpoint is public, so the answer
// says nothing about why; the log says it by code.

const NO_STORE = { "Cache-Control": "no-store" };

/** How long an answer is reused: anyone can call the endpoint, so not every call asks. */
export const READINESS_REUSE_MS = 1000;

/**
 * The probe's handler. The database is asked at most once a second per process, whatever the
 * number of callers; calls in between get the last answer.
 */
export function createReadiness(
  ping: () => Promise<DatabasePing>,
  options: { reuseMs?: number; now?: () => number } = {},
): () => Promise<Response> {
  const reuseMs = options.reuseMs ?? READINESS_REUSE_MS;
  const now = options.now ?? Date.now;
  let last: { result: Promise<DatabasePing>; at: number } | undefined;
  return async () => {
    if (!last || now() - last.at >= reuseMs) {
      const result = ping().then((answer) => {
        if (!answer.ok) {
          const detail =
            answer.reason === "failed" && answer.code ? `failed (${answer.code})` : answer.reason;
          console.warn(`readiness: the database didn't answer: ${detail}`);
        }
        return answer;
      });
      last = { result, at: now() };
    }
    const answer = await last.result;
    return answer.ok
      ? Response.json({ status: "ok" }, { headers: NO_STORE })
      : Response.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
  };
}
