"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import * as v from "valibot";
import { getAuth } from "@/shared/auth/auth";
import { CAPTCHA_MESSAGE } from "@/shared/auth/auth-errors";
import { requireAdmin } from "@/shared/auth/session";
import { env } from "@/shared/config/env";
import { formPassesTurnstile } from "@/shared/security/turnstile-form";
import { traceFlow } from "@/shared/telemetry/trace-flow";
import { parseForm } from "@/shared/validation/field-errors";
import { ClientIdSchema, CreateClientSchema, UpdateClientSchema } from "../schemas/client";
import {
  CLIENTS_PATH,
  createClient,
  deleteClient,
  rotateClientSecret,
  updateClient,
} from "../server/clients";
import type {
  ClientCredentials,
  ClientProblem,
  ClientResult,
  CreateClientState,
  CreateClientValues,
  UpdateClientState,
  UpdateClientValues,
} from "../types";

// The admin's client actions. Each one: the admin session (Next has already checked the
// request's Origin against the host), then valibot, then the plugin, which checks the session
// and the admin role again. They're public POST endpoints like any server action.

function valuesFrom(formData: FormData): CreateClientValues {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), kind: text("kind"), redirectUris: text("redirectUris") };
}

/** What a redirect URI may be, where this server runs. */
function redirectUriAdvice(): string {
  return env().isProduction
    ? "Use https:// addresses, with no #fragment."
    : "Use https:// addresses, with no #fragment. While developing, http:// works on localhost, 127.0.0.1 and *.localtest.me.";
}

/** Why a client wasn't created, in words an admin can act on. */
const CREATE_PROBLEMS: Record<Exclude<ClientProblem, "invalid-redirect-uri">, string> = {
  "not-allowed":
    "Only an admin can create clients, and this session isn't one any more. Sign in again.",
  "not-found": "The client wasn't created. Reload the page and try again.",
  "not-confidential": "The client wasn't created. Reload the page and try again.",
  failed: "The server couldn't create the client. The reason is in its log.",
};

export async function createClientAction(
  previous: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  await requireAdmin(CLIENTS_PATH);
  const values = valuesFrom(formData);
  const attempt = previous.status === "editing" ? previous.attempt + 1 : 0;

  const parsed = parseForm(CreateClientSchema, values);
  if (!parsed.ok) return { status: "editing", values, errors: parsed.errors, attempt };

  if (!(await formPassesTurnstile(formData))) {
    return { status: "editing", values, attempt, formError: CAPTCHA_MESSAGE };
  }

  const result = await traceFlow(
    "admin.client.create",
    async () => createClient(getAuth(), await headers(), parsed.value),
    { "oauth.client.type": parsed.value.kind },
  );
  if (!result.ok) {
    return result.problem === "invalid-redirect-uri"
      ? {
          status: "editing",
          values,
          attempt,
          errors: { redirectUris: redirectUriAdvice() },
        }
      : { status: "editing", values, attempt, formError: CREATE_PROBLEMS[result.problem] };
  }

  refresh();
  return { status: "created", credentials: result.value };
}

export async function updateClientAction(
  previous: UpdateClientState,
  formData: FormData,
): Promise<UpdateClientState> {
  await requireAdmin(CLIENTS_PATH);
  const field = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  const values: UpdateClientValues = { name: field("name"), redirectUris: field("redirectUris") };
  const attempt = previous.attempt + 1;

  const parsed = parseForm(UpdateClientSchema, { ...values, clientId: field("clientId") });
  if (!parsed.ok) {
    // The client ID is a hidden field: wrong only if the page was tampered with.
    const { clientId, ...errors } = parsed.errors;
    return {
      status: "editing",
      values,
      attempt,
      errors,
      ...(clientId
        ? { formError: "The changes weren't saved. Reload the page and try again." }
        : {}),
    };
  }
  if (!(await formPassesTurnstile(formData))) {
    return { status: "editing", values, attempt, formError: CAPTCHA_MESSAGE };
  }

  const result = await traceFlow(
    "admin.client.update",
    async () => updateClient(getAuth(), await headers(), parsed.value),
    { "oauth.client.id": parsed.value.clientId },
  );
  if (!result.ok) {
    return result.problem === "invalid-redirect-uri"
      ? { status: "editing", values, attempt, errors: { redirectUris: redirectUriAdvice() } }
      : { status: "editing", values, attempt, formError: UPDATE_PROBLEMS[result.problem] };
  }

  refresh();
  return { status: "saved", name: parsed.value.name, attempt };
}

const UPDATE_FAILED = "The server couldn't save the changes. The reason is in its log.";

const UPDATE_PROBLEMS: Record<Exclude<ClientProblem, "invalid-redirect-uri">, string> = {
  "not-found": "That client no longer exists. Reload the page.",
  "not-allowed":
    "This client can't be changed here: your admin session may have ended (sign in again), or it wasn't made here.",
  "not-confidential": UPDATE_FAILED,
  failed: UPDATE_FAILED,
};

const NOT_FOUND = { ok: false, problem: "not-found" } as const satisfies ClientResult<never>;

export async function rotateClientSecretAction(
  clientId: unknown,
): Promise<ClientResult<ClientCredentials>> {
  await requireAdmin(CLIENTS_PATH);
  const parsed = v.safeParse(ClientIdSchema, clientId);
  if (!parsed.success) return NOT_FOUND;
  return traceFlow(
    "admin.client.rotate_secret",
    async () => rotateClientSecret(getAuth(), await headers(), parsed.output),
    { "oauth.client.id": parsed.output },
  );
}

export async function deleteClientAction(
  clientId: unknown,
): Promise<{ ok: true } | { ok: false; problem: ClientProblem }> {
  await requireAdmin(CLIENTS_PATH);
  const parsed = v.safeParse(ClientIdSchema, clientId);
  if (!parsed.success) return NOT_FOUND;
  const result = await traceFlow(
    "admin.client.delete",
    async () => deleteClient(getAuth(), await headers(), parsed.output),
    { "oauth.client.id": parsed.output },
  );
  if (result.ok || result.problem === "not-found") refresh();
  return result.ok ? { ok: true } : result;
}
