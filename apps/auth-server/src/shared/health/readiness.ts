import "server-only";
import type { DatabasePing } from "@repo/db";

// The readiness probe's answer (/api/ready): ready only while the database answers, so a pod
// that can't reach it gets no traffic. Liveness and startup stay on /api/health, which touches
// nothing: a database outage must never restart pods. The endpoint is public, so the answer
// says nothing about why; the log says it by code.

const NO_STORE = { "Cache-Control": "no-store" };

export async function readiness(ping: () => Promise<DatabasePing>): Promise<Response> {
  const result = await ping();
  if (result.ok) return Response.json({ status: "ok" }, { headers: NO_STORE });
  const detail =
    result.reason === "failed" && result.code ? `failed (${result.code})` : result.reason;
  console.warn(`readiness: the database didn't answer: ${detail}`);
  return Response.json({ status: "unavailable" }, { status: 503, headers: NO_STORE });
}
