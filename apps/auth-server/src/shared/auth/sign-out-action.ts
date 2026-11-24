"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { traceFlow } from "@/shared/telemetry/trace-flow";
import { LOGIN_PATH } from "./constants";
import { callAuth } from "./server-endpoint";

/**
 * Ends this session (Better Auth clears its cookie), then the login page. Other devices stay
 * signed in: account security has "sign out everywhere". Without a session there's nothing to
 * end, and the login page is still the right place.
 */
export async function signOutAction(): Promise<void> {
  await traceFlow("auth.sign_out", () => callAuth({ path: "/sign-out" }));
  redirect(LOGIN_PATH as Route);
}
