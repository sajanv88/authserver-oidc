import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "../executor";
import { oauthClientResources } from "../schema/oauth-client-resources";
import { type OAuthClient, oauthClients } from "../schema/oauth-clients";

// Reads of the OAuth clients table for the admin list and the consent screen. Creating,
// rotating and deleting clients go through @better-auth/oauth-provider, which hashes secrets.

/** A row of the admin client list. Never carries the secret, hashed or not. */
export type OAuthClientSummary = Pick<
  OAuthClient,
  | "id"
  | "clientId"
  | "name"
  | "tokenEndpointAuthMethod"
  | "redirectUris"
  | "scopes"
  | "disabled"
  | "createdAt"
>;

/** All clients, newest first, a page at a time (at most 100). */
export async function listOAuthClients(
  db: Executor,
  options: { limit?: number; offset?: number } = {},
): Promise<OAuthClientSummary[]> {
  const limit = Math.min(options.limit ?? 50, 100);
  return db
    .select({
      id: oauthClients.id,
      clientId: oauthClients.clientId,
      name: oauthClients.name,
      tokenEndpointAuthMethod: oauthClients.tokenEndpointAuthMethod,
      redirectUris: oauthClients.redirectUris,
      scopes: oauthClients.scopes,
      disabled: oauthClients.disabled,
      createdAt: oauthClients.createdAt,
    })
    .from(oauthClients)
    .orderBy(desc(oauthClients.createdAt), desc(oauthClients.id))
    .limit(limit)
    .offset(options.offset ?? 0);
}

/** How many clients there are, for paging through listOAuthClients. */
export async function countOAuthClients(db: Executor): Promise<number> {
  const [row] = await db.select({ total: count() }).from(oauthClients);
  return row?.total ?? 0;
}

/** A client as the provisioning script compares it: what it is, and the APIs it may ask for. */
export type OAuthClientRegistration = Pick<
  OAuthClient,
  | "clientId"
  | "name"
  | "tokenEndpointAuthMethod"
  | "grantTypes"
  | "disabled"
  | "backchannelLogoutUri"
  | "metadata"
> & {
  /** Where the client may send people after it signs them out; empty when none. */
  postLogoutRedirectUris: string[];
  /** The resource identifiers (APIs) the client is linked to, sorted. */
  resources: string[];
};

/** The clients with exactly this name, oldest first. Names aren't unique, so it's a list. */
export async function findOAuthClientsByName(
  db: Executor,
  name: string,
): Promise<OAuthClientRegistration[]> {
  const clients = await db
    .select({
      clientId: oauthClients.clientId,
      name: oauthClients.name,
      tokenEndpointAuthMethod: oauthClients.tokenEndpointAuthMethod,
      grantTypes: oauthClients.grantTypes,
      disabled: oauthClients.disabled,
      backchannelLogoutUri: oauthClients.backchannelLogoutUri,
      metadata: oauthClients.metadata,
      postLogoutRedirectUris: oauthClients.postLogoutRedirectUris,
    })
    .from(oauthClients)
    .where(eq(oauthClients.name, name))
    .orderBy(asc(oauthClients.createdAt), asc(oauthClients.id));
  if (clients.length === 0) return [];

  const links = await db
    .select({ clientId: oauthClientResources.clientId, resource: oauthClientResources.resourceId })
    .from(oauthClientResources)
    .where(
      inArray(
        oauthClientResources.clientId,
        clients.map((client) => client.clientId),
      ),
    );
  return clients.map((client) => ({
    ...client,
    postLogoutRedirectUris: client.postLogoutRedirectUris ?? [],
    resources: links
      .filter((link) => link.clientId === client.clientId)
      .map((link) => link.resource)
      .sort(),
  }));
}

/** What the consent screen may show about a client: its public metadata only. */
export type OAuthClientPublicInfo = Pick<
  OAuthClient,
  "clientId" | "name" | "uri" | "icon" | "policy" | "tos" | "disabled"
>;

export async function getOAuthClientPublicInfo(
  db: Executor,
  clientId: string,
): Promise<OAuthClientPublicInfo | undefined> {
  const [client] = await db
    .select({
      clientId: oauthClients.clientId,
      name: oauthClients.name,
      uri: oauthClients.uri,
      icon: oauthClients.icon,
      policy: oauthClients.policy,
      tos: oauthClients.tos,
      disabled: oauthClients.disabled,
    })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return client;
}
