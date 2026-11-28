import { db, pingDatabase } from "@repo/db";
import { connection } from "next/server";
import { createReadiness } from "@/shared/health/readiness";

// Readiness for the Kubernetes probe: the database must answer (shared/health/readiness.ts).
const readiness = createReadiness(() => pingDatabase(db));

export async function GET() {
  await connection();
  return readiness();
}
