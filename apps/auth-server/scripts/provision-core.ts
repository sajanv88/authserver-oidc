import {
  type Executor,
  findOAuthClientsByName,
  getUserSecurityByEmail,
  type OAuthClientRegistration,
} from "@repo/db";
import { makeSignature } from "better-auth/crypto";
import * as v from "valibot";
import type { Auth } from "@/shared/auth/auth-config";
import { machineClientDefaults, oidcClientDefaults } from "@/shared/auth/oidc-client-defaults";
import type { OAuthApiConfig } from "@/shared/config/env";

// Provisioning: the OIDC clients a deployment needs (one per platform zone, one per service
// that calls APIs as itself), declared in a JSON file and made to match it. Everything goes
// through the plugin's admin endpoints, as the admin screen does, so secrets are hashed and
// URIs checked the same way. Safe to run again: a client is found by its name and updated.
// Nothing is deleted: a client removed from the file stays until an admin deletes it.

/** A problem the person running the script can fix; its message says how. */
export class ProvisionError extends Error {}

const Name = v.pipe(v.string(), v.trim(), v.nonEmpty("needs a name"), v.maxLength(100));
const Uri = v.pipe(v.string(), v.url("must be a full URL"));
const Names = v.pipe(v.array(v.pipe(v.string(), v.nonEmpty())), v.maxLength(50));

/** An app that signs people in: a zone's BFF, or any server-side app with a secret. */
const WebClientSchema = v.object({
  type: v.literal("web"),
  name: Name,
  redirectUris: v.pipe(v.array(Uri), v.minLength(1, "needs at least one redirect URI")),
  postLogoutRedirectUris: v.optional(v.array(Uri), []),
  /** Where the server POSTs a logout token when the user's session ends (https, or loopback). */
  backchannelLogoutUri: v.optional(Uri),
  /** The platform's own app: no consent screen. Never for someone else's app. */
  firstParty: v.optional(v.boolean(), false),
  /** API scopes (OAUTH_API_SCOPES) it may ask for, beside the OpenID Connect ones. */
  scopes: v.optional(Names, []),
  /** APIs (OAUTH_RESOURCES) it may ask tokens for. */
  resources: v.optional(Names, []),
});

/** A service that calls APIs as itself, with client credentials. */
const MachineClientSchema = v.object({
  type: v.literal("machine"),
  name: Name,
  scopes: v.pipe(Names, v.minLength(1, "needs at least one scope")),
  resources: v.optional(Names, []),
});

export const ProvisionFileSchema = v.pipe(
  v.object({
    clients: v.pipe(
      v.array(v.variant("type", [WebClientSchema, MachineClientSchema])),
      v.maxLength(100),
    ),
  }),
  v.check(
    ({ clients }) => new Set(clients.map((client) => client.name)).size === clients.length,
    "each client needs its own name: the name is how a later run finds it",
  ),
);

export type ProvisionFile = v.InferOutput<typeof ProvisionFileSchema>;
type ClientSpec = ProvisionFile["clients"][number];

export type ProvisionResult = {
  name: string;
  clientId: string;
  status: "created" | "updated";
  /** Only for a client created now: shown once, never stored in the clear. */
  clientSecret?: string;
};

/** The file's contents, checked; errors name the client and the field. */
export function parseProvisionFile(input: unknown): ProvisionFile {
  const parsed = v.safeParse(ProvisionFileSchema, input);
  if (parsed.success) return parsed.output;
  const lines = parsed.issues.map((issue) => {
    const path = issue.path?.map((item) => String(item.key)).join(".") ?? "file";
    return `${path}: ${issue.message}`;
  });
  throw new ProvisionError(`The clients file isn't valid:\n  - ${lines.join("\n  - ")}`);
}

/** Every scope and API named in the file must be one this server offers. */
function checkAgainstServer(file: ProvisionFile, oauth: OAuthApiConfig): void {
  const problems: string[] = [];
  for (const client of file.clients) {
    for (const scope of client.scopes) {
      if (!oauth.apiScopes.includes(scope)) {
        problems.push(`${client.name}: scope "${scope}" isn't in OAUTH_API_SCOPES`);
      }
    }
    for (const resource of client.resources) {
      if (!oauth.resources.includes(resource)) {
        problems.push(`${client.name}: resource "${resource}" isn't in OAUTH_RESOURCES`);
      }
    }
  }
  if (problems.length > 0) throw new ProvisionError(problems.join("\n"));
}

/**
 * Request headers carrying a new five-minute session for this admin, as its browser would
 * send them. The plugin creates clients only for a signed-in admin; minting the session
 * directly means an admin with two-factor on can run this too. Whoever runs the script has
 * DATABASE_URL and BETTER_AUTH_SECRET, which already give full control, so it grants nothing
 * new. The caller ends the session.
 */
async function adminSession(
  auth: Auth,
  database: Executor,
  email: string,
): Promise<{ headers: Headers; end: () => Promise<void> }> {
  const user = await getUserSecurityByEmail(database, email);
  if (user?.role !== "admin") {
    throw new ProvisionError(`${email} isn't an admin of this server.`);
  }
  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id, true, {
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    userAgent: "provision-clients",
  });
  const signature = await makeSignature(session.token, context.secret);
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(
    `${session.token}.${signature}`,
  )}`;
  return {
    headers: new Headers({ cookie }),
    end: () => context.internalAdapter.deleteSession(session.token),
  };
}

function kindOf(existing: OAuthClientRegistration): ClientSpec["type"] {
  return existing.grantTypes?.includes("client_credentials") ? "machine" : "web";
}

async function create(auth: Auth, headers: Headers, spec: ClientSpec): Promise<ProvisionResult> {
  const body =
    spec.type === "machine"
      ? { ...machineClientDefaults(spec.scopes), client_name: spec.name }
      : {
          ...oidcClientDefaults(spec.scopes),
          client_name: spec.name,
          redirect_uris: spec.redirectUris,
          token_endpoint_auth_method: "client_secret_basic" as const,
          skip_consent: spec.firstParty,
          // Lets the zone end the session here when someone signs out of it.
          enable_end_session: true,
          ...(spec.postLogoutRedirectUris.length > 0
            ? { post_logout_redirect_uris: spec.postLogoutRedirectUris }
            : {}),
          ...(spec.backchannelLogoutUri
            ? { backchannel_logout_uri: spec.backchannelLogoutUri }
            : {}),
        };
  const client = await auth.api.adminCreateOAuthClient({
    headers,
    body: { ...body, ...(spec.resources.length > 0 ? { resources: spec.resources } : {}) },
  });
  return {
    name: spec.name,
    clientId: client.client_id,
    status: "created",
    ...(client.client_secret ? { clientSecret: client.client_secret } : {}),
  };
}

async function update(
  auth: Auth,
  headers: Headers,
  spec: ClientSpec,
  existing: OAuthClientRegistration,
): Promise<ProvisionResult> {
  if (kindOf(existing) !== spec.type) {
    throw new ProvisionError(
      `${spec.name} exists as a ${kindOf(existing)} client; the file says ${spec.type}. ` +
        "Delete it on the admin screen first, then run this again.",
    );
  }
  const changes =
    spec.type === "machine"
      ? {
          scope: machineClientDefaults(spec.scopes).scope,
          client_credentials_scopes: spec.scopes,
        }
      : {
          scope: oidcClientDefaults(spec.scopes).scope,
          redirect_uris: spec.redirectUris,
          skip_consent: spec.firstParty,
          enable_end_session: true,
          ...(spec.postLogoutRedirectUris.length > 0
            ? { post_logout_redirect_uris: spec.postLogoutRedirectUris }
            : {}),
          ...(spec.backchannelLogoutUri
            ? { backchannel_logout_uri: spec.backchannelLogoutUri }
            : {}),
        };
  await auth.api.adminUpdateOAuthClient({
    headers,
    body: { client_id: existing.clientId, update: changes },
  });

  const params = (identifier: string) => ({ identifier, client_id: existing.clientId });
  for (const resource of spec.resources.filter((r) => !existing.resources.includes(r))) {
    await auth.api.adminLinkClientResource({ headers, params: params(resource) });
  }
  for (const resource of existing.resources.filter((r) => !spec.resources.includes(r))) {
    await auth.api.adminUnlinkClientResource({ headers, params: params(resource) });
  }
  return { name: spec.name, clientId: existing.clientId, status: "updated" };
}

export async function provision(
  auth: Auth,
  database: Executor,
  input: { adminEmail: string; file: ProvisionFile; oauth: OAuthApiConfig },
): Promise<ProvisionResult[]> {
  checkAgainstServer(input.file, input.oauth);
  const session = await adminSession(auth, database, input.adminEmail);
  try {
    const results: ProvisionResult[] = [];
    for (const spec of input.file.clients) {
      const found = await findOAuthClientsByName(database, spec.name);
      if (found.length > 1) {
        throw new ProvisionError(
          `${found.length} clients are named ${spec.name}; delete the extra ones on the admin screen.`,
        );
      }
      const [existing] = found;
      results.push(
        existing
          ? await update(auth, session.headers, spec, existing)
          : await create(auth, session.headers, spec),
      );
    }
    return results;
  } finally {
    await session.end();
  }
}
