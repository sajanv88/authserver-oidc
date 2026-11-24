import "server-only";
import { countOAuthClients, db, listOAuthClients, type OAuthClientSummary } from "@repo/db";
import type { Auth } from "@/shared/auth/auth-config";
import { oidcClientDefaults } from "@/shared/auth/oidc-client-defaults";
import { requireAdmin } from "@/shared/auth/session";
import {
  CLIENTS_PER_PAGE,
  type CreateClientInput,
  type UpdateClientInput,
} from "../schemas/client";
import type {
  ClientCredentials,
  ClientProblem,
  ClientResult,
  ClientRow,
  ClientsPage,
} from "../types";

// Managing OIDC clients through @better-auth/oauth-provider, which hashes the secrets and
// checks redirect URIs. Its client endpoints check the admin session again themselves
// (`clientPrivileges`), so these are safe whoever calls them; the actions call them after
// requireAdmin and valibot.

export const CLIENTS_PATH = "/admin/clients";

export function toClientRow(client: OAuthClientSummary): ClientRow {
  return {
    clientId: client.clientId,
    name: client.name ?? client.clientId,
    kind: client.tokenEndpointAuthMethod === "none" ? "public" : "confidential",
    redirectUris: client.redirectUris,
    disabled: client.disabled,
    createdAt: client.createdAt.toISOString(),
  };
}

/**
 * One page of the admin list, newest first. A page past the end is the last one, so the
 * caller can send the browser there. Checks the admin session itself.
 */
export async function listClientsForAdmin(page: number): Promise<ClientsPage> {
  await requireAdmin(CLIENTS_PATH);
  const total = await countOAuthClients(db);
  const pageCount = Math.max(1, Math.ceil(total / CLIENTS_PER_PAGE));
  const shown = Math.min(page, pageCount);
  const rows = await listOAuthClients(db, {
    limit: CLIENTS_PER_PAGE,
    offset: (shown - 1) * CLIENTS_PER_PAGE,
  });
  return { clients: rows.map(toClientRow), page: shown, pageCount, total };
}

/** The plugin's errors, as something the screen can say. */
function problemFrom(error: unknown): ClientProblem {
  const body = (error as { body?: { error?: unknown; code?: unknown } } | null)?.body;
  if (body?.error === "invalid_redirect_uri" || body?.code === "VALIDATION_ERROR") {
    return "invalid-redirect-uri";
  }
  if (body?.error === "not_found") return "not-found";
  if (body?.error === "invalid_client") return "not-confidential";
  const status = (error as { statusCode?: unknown } | null)?.statusCode;
  if (status === 401 || status === 403) return "not-allowed";
  return "failed";
}

async function attempt<T>(run: () => Promise<T>): Promise<ClientResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const problem = problemFrom(error);
    if (problem === "failed") console.error("oidc-clients: the plugin refused", error);
    return { ok: false, problem };
  }
}

/** A new client. Public ones get no secret; confidential ones get one, returned only here. */
export function createClient(
  auth: Auth,
  headers: Headers,
  input: CreateClientInput,
): Promise<ClientResult<ClientCredentials>> {
  return attempt(async () => {
    const client = await auth.api.adminCreateOAuthClient({
      headers,
      body: {
        ...oidcClientDefaults(),
        client_name: input.name,
        redirect_uris: input.redirectUris,
        token_endpoint_auth_method: input.kind === "public" ? "none" : "client_secret_basic",
      },
    });
    return {
      name: client.client_name ?? input.name,
      clientId: client.client_id,
      clientSecret: client.client_secret,
    };
  });
}

/**
 * A client's new name and redirect URIs. The plugin checks the URIs as it does on create, and
 * that the client is the admins'. Its kind, scopes and secret stay as they are.
 */
export function updateClient(
  auth: Auth,
  headers: Headers,
  input: UpdateClientInput,
): Promise<ClientResult<null>> {
  return attempt(async () => {
    await auth.api.adminUpdateOAuthClient({
      headers,
      body: {
        client_id: input.clientId,
        update: { client_name: input.name, redirect_uris: input.redirectUris },
      },
    });
    return null;
  });
}

/** A new secret for a confidential client. The old one stops working at once. */
export function rotateClientSecret(
  auth: Auth,
  headers: Headers,
  clientId: string,
): Promise<ClientResult<ClientCredentials>> {
  return attempt(async () => {
    const client = await auth.api.rotateClientSecret({ headers, body: { client_id: clientId } });
    return {
      name: client.client_name ?? clientId,
      clientId: client.client_id,
      clientSecret: client.client_secret,
    };
  });
}

/** Deletes a client, with its consents and tokens (the tables cascade). */
export function deleteClient(
  auth: Auth,
  headers: Headers,
  clientId: string,
): Promise<ClientResult<null>> {
  return attempt(async () => {
    await auth.api.deleteOAuthClient({ headers, body: { client_id: clientId } });
    return null;
  });
}
