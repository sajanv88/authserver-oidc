import { connection, type NextRequest } from "next/server";
import { signOut } from "@/features/oidc";

export async function POST(request: NextRequest) {
  await connection();
  return signOut(request);
}
