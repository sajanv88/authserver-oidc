import { connection } from "next/server";
import { getAuth } from "@/shared/auth/auth";
import { openIdConfigurationResponse } from "@/shared/auth/discovery";

// OIDC discovery for the issuer (the bare origin). Public metadata: no auth.
export async function GET(request: Request): Promise<Response> {
  await connection(); // per request: never prerendered at build, which has no env
  return openIdConfigurationResponse(getAuth(), request);
}
