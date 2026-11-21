import * as v from "valibot";
import type { Discovery } from "./discovery";

// Requests to the token endpoint (RFC 6749 4.1.3 and 6) and the userinfo endpoint.

const TokenResponseSchema = v.object({
  access_token: v.pipe(v.string(), v.nonEmpty()),
  token_type: v.string(),
  expires_in: v.optional(v.number()),
  id_token: v.optional(v.string()),
  refresh_token: v.optional(v.string()),
  scope: v.optional(v.string()),
});

export type TokenResponse = v.InferOutput<typeof TokenResponseSchema>;

export type Client = { clientId: string; clientSecret: string | undefined };

/** A public client names itself in the body; a confidential one authenticates with Basic. */
function clientAuthentication(client: Client, form: URLSearchParams): HeadersInit {
  if (!client.clientSecret) {
    form.set("client_id", client.clientId);
    return {};
  }
  const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
  return { authorization: `Basic ${btoa(pair)}` };
}

async function tokenRequest(
  discovery: Discovery,
  client: Client,
  form: URLSearchParams,
): Promise<TokenResponse> {
  const authorization = clientAuthentication(client, form);
  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
      ...authorization,
    },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: unknown } | null)?.error;
    throw new Error(
      `The token endpoint refused: ${typeof error === "string" ? error : response.status}.`,
    );
  }
  return v.parse(TokenResponseSchema, body);
}

/** Redeems an authorization code, proving with the PKCE verifier that this app asked for it. */
export function exchangeCode(
  discovery: Discovery,
  client: Client,
  input: { code: string; verifier: string; redirectUri: string },
): Promise<TokenResponse> {
  return tokenRequest(
    discovery,
    client,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      redirect_uri: input.redirectUri,
    }),
  );
}

/** New tokens for a refresh token. The server rotates it: the old one stops working. */
export function refreshTokens(
  discovery: Discovery,
  client: Client,
  refreshToken: string,
): Promise<TokenResponse> {
  return tokenRequest(
    discovery,
    client,
    new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  );
}

/** Revokes a refresh token at sign-out (RFC 7009), when the server offers revocation. */
export async function revokeRefreshToken(
  discovery: Discovery,
  client: Client,
  refreshToken: string,
): Promise<void> {
  if (!discovery.revocation_endpoint) return;
  const form = new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" });
  const authorization = clientAuthentication(client, form);
  await fetch(discovery.revocation_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...authorization },
    body: form.toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  }).catch(() => undefined);
}

export type UserInfo =
  | { ok: true; claims: Record<string, unknown> }
  | { ok: false; status: number };

/** The userinfo endpoint, with the access token as a Bearer token. */
export async function fetchUserInfo(discovery: Discovery, accessToken: string): Promise<UserInfo> {
  const response = await fetch(discovery.userinfo_endpoint, {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return { ok: false, status: response.status };
  const claims: unknown = await response.json();
  return claims && typeof claims === "object"
    ? { ok: true, claims: claims as Record<string, unknown> }
    : { ok: false, status: 502 };
}
