import "server-only";
import { db, listOAuthClients, type OAuthClientSummary } from "@repo/db";
import type { Auth } from "@/shared/auth/auth-config";
import { OIDC_SCOPES } from "@/shared/auth/auth-config";
import { requireAdmin } from "@/shared/auth/session";
import type { CreateClientInput } from "../schemas/client";
import type { ClientCredentials, ClientProblem, ClientResult, ClientRow } from "../types";

// Managing OIDC clients through @better-auth/oauth-provider, which hashes the secrets and
// checks redirect URIs. Its client endpoints check the admin session again themselves
// (`clientPrivileges`), so these are safe whoever calls them; the actions call them after
// requireAdmin and valibot.

export const CLIENTS_PATH = "/admin/clients";

/** Every client this server issues tokens to: the code flow with PKCE, and refresh tokens. */
const CLIENT_DEFAULTS = {
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  require_pkce: true,
} as const;

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

/** The client list for the admin page. Checks the admin session itself. */
export async function listClientsForAdmin(): Promise<ClientRow[]> {
  await requireAdmin(CLIENTS_PATH);
  return (await listOAuthClients(db, { limit: 100 })).map(toClientRow);
}

/** The plugin's errors, as something the screen can say. */
function problemFrom(error: unknown): ClientProblem {
  const body = (error as { body?: { error?: unknown; code?: unknown } } | null)?.body;
  if (body?.error === "invalid_redirect_uri" || body?.code === "VALIDATION_ERROR") {
    return "invalid-redirect-uri";
  }
  if (body?.error === "not_found") return "not-found";
  if (body?.error === "invalid_client") return "not-confidential";
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
        ...CLIENT_DEFAULTS,
        grant_types: [...CLIENT_DEFAULTS.grant_types],
        response_types: [...CLIENT_DEFAULTS.response_types],
        client_name: input.name,
        redirect_uris: input.redirectUris,
        scope: OIDC_SCOPES.join(" "),
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
