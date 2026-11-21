import { connection } from "next/server";
import { getAuth } from "@/shared/auth/auth";
import { authorizationServerMetadataResponse } from "@/shared/auth/discovery";

// RFC 8414 authorization server metadata, for OAuth clients that don't speak OIDC discovery.
export async function GET(request: Request): Promise<Response> {
  await connection(); // per request: never prerendered at build, which has no env
  return authorizationServerMetadataResponse(getAuth(), request);
}
