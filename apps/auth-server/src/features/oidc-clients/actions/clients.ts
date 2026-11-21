"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import * as v from "valibot";
import { getAuth } from "@/shared/auth/auth";
import { requireAdmin } from "@/shared/auth/session";
import { parseForm } from "@/shared/validation/field-errors";
import { ClientIdSchema, CreateClientSchema } from "../schemas/client";
import { CLIENTS_PATH, createClient, deleteClient, rotateClientSecret } from "../server/clients";
import type {
  ClientCredentials,
  ClientProblem,
  ClientResult,
  CreateClientState,
  CreateClientValues,
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

export async function createClientAction(
  previous: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  await requireAdmin(CLIENTS_PATH);
  const values = valuesFrom(formData);
  const attempt = previous.status === "editing" ? previous.attempt + 1 : 0;

  const parsed = parseForm(CreateClientSchema, values);
  if (!parsed.ok) return { status: "editing", values, errors: parsed.errors, attempt };

  const result = await createClient(getAuth(), await headers(), parsed.value);
  if (!result.ok) {
    return result.problem === "invalid-redirect-uri"
      ? {
          status: "editing",
          values,
          attempt,
          errors: {
            redirectUris:
              "Use https:// addresses. http:// works only for localhost while developing.",
          },
        }
      : { status: "editing", values, attempt, formError: "The client wasn't created. Try again." };
  }

  refresh();
  return { status: "created", credentials: result.value };
}

const NOT_FOUND = { ok: false, problem: "not-found" } as const satisfies ClientResult<never>;

export async function rotateClientSecretAction(
  clientId: unknown,
): Promise<ClientResult<ClientCredentials>> {
  await requireAdmin(CLIENTS_PATH);
  const parsed = v.safeParse(ClientIdSchema, clientId);
  if (!parsed.success) return NOT_FOUND;
  return rotateClientSecret(getAuth(), await headers(), parsed.output);
}

export async function deleteClientAction(
  clientId: unknown,
): Promise<{ ok: true } | { ok: false; problem: ClientProblem }> {
  await requireAdmin(CLIENTS_PATH);
  const parsed = v.safeParse(ClientIdSchema, clientId);
  if (!parsed.success) return NOT_FOUND;
  const result = await deleteClient(getAuth(), await headers(), parsed.output);
  if (result.ok || result.problem === "not-found") refresh();
  return result.ok ? { ok: true } : result;
}
