import * as v from "valibot";
import type { Discovery } from "./discovery.js";
import { IdpError, type IdpErrorCode } from "./errors.js";
import type { Http } from "./http.js";

// Requests to the token endpoint (RFC 6749 4.1.3 and 6), revocation (RFC 7009) and userinfo.

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
function authenticate(client: Client, form: URLSearchParams): Record<string, string> {
  if (!client.clientSecret) {
    form.set("client_id", client.clientId);
    return {};
  }
  // RFC 6749 2.3.1: each part form-encoded before Basic.
  const pair = `${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`;
  return { authorization: `Basic ${btoa(pair)}` };
}

/** The OAuth error code in a refusal, if it's a plain word; never its description. */
function oauthError(data: unknown): string | undefined {
  const error = (data as { error?: unknown } | null | undefined)?.error;
  return typeof error === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(error) ? error : undefined;
}

async function tokenRequest(
  http: Http,
  discovery: Discovery,
  client: Client,
  form: URLSearchParams,
  code: IdpErrorCode,
): Promise<TokenResponse> {
  const headers = authenticate(client, form);
  let answer: Awaited<ReturnType<Http["postForm"]>>;
  try {
    answer = await http.postForm(discovery.token_endpoint, form, headers);
  } catch (cause) {
    throw new IdpError(code, "The token endpoint didn't answer.", { cause });
  }
  if (!answer.ok) {
    throw new IdpError(
      code,
      `The token endpoint refused: ${oauthError(answer.data) ?? answer.status}.`,
      { status: answer.status },
    );
  }
  const parsed = v.safeParse(TokenResponseSchema, answer.data);
  if (!parsed.success) throw new IdpError(code, "The token endpoint's answer isn't valid.");
  return parsed.output;
}

/** Redeems an authorization code, proving with the PKCE verifier that this app asked for it. */
export function exchangeCode(
  http: Http,
  discovery: Discovery,
  client: Client,
  input: { code: string; verifier: string; redirectUri: string; resource: string | undefined },
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
  });
  if (input.resource) form.set("resource", input.resource);
  return tokenRequest(http, discovery, client, form, "token_failed");
}

/** New tokens for a refresh token. The server rotates it: the old one stops working. */
export function refreshTokens(
  http: Http,
  discovery: Discovery,
  client: Client,
  input: { refreshToken: string; resource: string | undefined },
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });
  if (input.resource) form.set("resource", input.resource);
  return tokenRequest(http, discovery, client, form, "refresh_failed");
}

/** Revokes a refresh token at sign-out, when the server offers revocation. Never throws. */
export async function revokeRefreshToken(
  http: Http,
  discovery: Discovery,
  client: Client,
  refreshToken: string,
): Promise<void> {
  if (!discovery.revocation_endpoint) return;
  const form = new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" });
  const headers = authenticate(client, form);
  await http.postForm(discovery.revocation_endpoint, form, headers).catch(() => undefined);
}

/** The userinfo endpoint's claims for an access token. */
export async function fetchUserInfo(
  http: Http,
  discovery: Discovery,
  accessToken: string,
): Promise<Record<string, unknown>> {
  if (!discovery.userinfo_endpoint) {
    throw new IdpError("userinfo_failed", "The auth server has no userinfo endpoint.");
  }
  let answer: Awaited<ReturnType<Http["get"]>>;
  try {
    answer = await http.get(discovery.userinfo_endpoint, {
      authorization: `Bearer ${accessToken}`,
    });
  } catch (cause) {
    throw new IdpError("userinfo_failed", "The userinfo endpoint didn't answer.", { cause });
  }
  if (!answer.ok) {
    throw new IdpError("userinfo_failed", `The userinfo endpoint answered ${answer.status}.`, {
      status: answer.status,
    });
  }
  if (!answer.data || typeof answer.data !== "object" || Array.isArray(answer.data)) {
    throw new IdpError("userinfo_failed", "The userinfo answer isn't an object.");
  }
  return answer.data as Record<string, unknown>;
}
