import { db, pingDatabase } from "@repo/db";
import { connection } from "next/server";
import { readiness } from "@/shared/health/readiness";

// Readiness for the Kubernetes probe: the database must answer (shared/health/readiness.ts).
export async function GET() {
  await connection();
  return readiness(() => pingDatabase(db));
}
