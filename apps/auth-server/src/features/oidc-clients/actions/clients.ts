"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import * as v from "valibot";
import { getAuth } from "@/shared/auth/auth";
import { CAPTCHA_MESSAGE } from "@/shared/auth/auth-errors";
import { captchaToken } from "@/shared/auth/captcha";
import { requireAdmin } from "@/shared/auth/session";
import { env } from "@/shared/config/env";
import { turnstileHostnames, verifyTurnstileToken } from "@/shared/security/turnstile";
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

/**
 * Turnstile, when it's on. These forms post to the plugin's server API, which the captcha
 * plugin doesn't see, so the token is checked here.
 */
async function passesTurnstile(formData: FormData): Promise<boolean> {
  const config = env();
  if (!config.turnstile) return true;
  return verifyTurnstileToken(config.turnstile, captchaToken(formData), turnstileHostnames(config));
}

const REDIRECT_URI_ADVICE =
  "Use https:// addresses. http:// works only for localhost while developing.";

export async function createClientAction(
  previous: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  await requireAdmin(CLIENTS_PATH);
  const values = valuesFrom(formData);
  const attempt = previous.status === "editing" ? previous.attempt + 1 : 0;

  const parsed = parseForm(CreateClientSchema, values);
  if (!parsed.ok) return { status: "editing", values, errors: parsed.errors, attempt };

  if (!(await passesTurnstile(formData))) {
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
          errors: { redirectUris: REDIRECT_URI_ADVICE },
        }
      : { status: "editing", values, attempt, formError: "The client wasn't created. Try again." };
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
      ...(clientId ? { formError: UPDATE_FAILED } : {}),
    };
  }
  if (!(await passesTurnstile(formData))) {
    return { status: "editing", values, attempt, formError: CAPTCHA_MESSAGE };
  }

  const result = await traceFlow(
    "admin.client.update",
    async () => updateClient(getAuth(), await headers(), parsed.value),
    { "oauth.client.id": parsed.value.clientId },
  );
  if (!result.ok) {
    return result.problem === "invalid-redirect-uri"
      ? { status: "editing", values, attempt, errors: { redirectUris: REDIRECT_URI_ADVICE } }
      : { status: "editing", values, attempt, formError: UPDATE_PROBLEMS[result.problem] };
  }

  refresh();
  return { status: "saved", name: parsed.value.name, attempt };
}

const UPDATE_FAILED = "The changes weren't saved. Try again.";

const UPDATE_PROBLEMS: Record<Exclude<ClientProblem, "invalid-redirect-uri">, string> = {
  "not-found": "That client no longer exists. Reload the page.",
  "not-allowed": "This client wasn't made here, so it can't be changed here.",
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
