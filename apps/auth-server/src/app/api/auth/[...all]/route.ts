import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/shared/auth/auth";

// Every Better Auth endpoint: sign-in, sign-up, sessions, two-factor, magic links, and the
// OAuth 2.1 / OIDC provider under /api/auth/oauth2/*. Better Auth authenticates, rate-limits
// and checks the origin of each request itself.

export async function GET(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return toNextJsHandler(getAuth()).POST(request);
}
