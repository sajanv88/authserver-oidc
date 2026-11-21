import { connection } from "next/server";
import { startSignIn } from "@/features/oidc";

export async function GET() {
  await connection();
  return startSignIn();
}
