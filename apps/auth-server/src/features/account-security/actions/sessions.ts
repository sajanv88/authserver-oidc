"use server";

import { db } from "@repo/db";
import type { Route } from "next";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as v from "valibot";
import { getAuth } from "@/shared/auth/auth";
import { LOGIN_PATH } from "@/shared/auth/constants";
import { requireSession } from "@/shared/auth/session";
import { traceFlow } from "@/shared/telemetry/trace-flow";
import { SessionIdSchema } from "../schemas/account";
import { revokeSession, SECURITY_PATH, signOutEverywhere } from "../server/sessions";
import type { SessionProblem } from "../types";

// The session list's actions. Each one: the session (Next has already checked the request's
// Origin against the host), valibot, then Better Auth, which checks ownership again.

export async function revokeSessionAction(
  sessionId: unknown,
): Promise<{ ok: true } | { ok: false; problem: SessionProblem }> {
  const session = await requireSession(SECURITY_PATH);
  const parsed = v.safeParse(SessionIdSchema, sessionId);
  if (!parsed.success) return { ok: false, problem: "not-found" };
  const result = await traceFlow("account.session.revoke", async () =>
    revokeSession(
      getAuth(),
      await headers(),
      db,
      { userId: session.user.id, currentSessionId: session.session.id },
      parsed.output,
    ),
  );
  if (result.ok || result.problem === "not-found") refresh();
  return result;
}

export async function signOutEverywhereAction(): Promise<{ ok: false }> {
  await requireSession(SECURITY_PATH);
  const signedOut = await traceFlow("account.sign_out_everywhere", async () =>
    signOutEverywhere(getAuth(), await headers()),
  );
  if (!signedOut) return { ok: false };
  // Every session is gone, this one too (its cookie was cleared): sign in again.
  redirect(LOGIN_PATH as Route);
}
