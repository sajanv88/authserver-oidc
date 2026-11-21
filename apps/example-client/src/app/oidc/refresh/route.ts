import { connection, type NextRequest } from "next/server";
import { refreshSession } from "@/features/oidc";

export async function POST(request: NextRequest) {
  await connection();
  return refreshSession(request);
}
