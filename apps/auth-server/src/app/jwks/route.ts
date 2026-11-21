import { connection } from "next/server";
import { getAuth } from "@/shared/auth/auth";
import { jwksResponse } from "@/shared/auth/discovery";

// The public signing keys (the jwks_uri in discovery). Same keys as /api/auth/jwks.
export async function GET(): Promise<Response> {
  await connection(); // per request: never prerendered at build, which has no env
  return jwksResponse(getAuth());
}
