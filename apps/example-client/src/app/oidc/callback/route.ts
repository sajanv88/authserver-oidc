import { connection, type NextRequest } from "next/server";
import { finishSignIn } from "@/features/oidc";

export async function GET(request: NextRequest) {
  await connection();
  return finishSignIn(request);
}
