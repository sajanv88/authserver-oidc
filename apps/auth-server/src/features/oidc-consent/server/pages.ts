import "server-only";
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { db, getOAuthClientPublicInfo } from "@repo/db";
import {
  authorizeUrlFrom,
  type SearchParamsInput,
  signedOidcQuery,
} from "@/shared/auth/oidc-query";
import { getSession, redirectToSafePath } from "@/shared/auth/session";
import { env } from "@/shared/config/env";
import type { ConsentPageContext, ConsentRequest } from "../types";
import { consentScopes } from "./scopes";

/**
 * The consent page's query, checked: Better Auth sends people here with the authorization
 * request and its signature (HMAC with BETTER_AUTH_SECRET, 10 minutes). The page shows only
 * what that signature vouches for, so an altered link can't put another app's name, or other
 * scopes, in front of someone. Approving re-checks it anyway (the consent endpoint does).
 */
export async function readConsentRequest(
  searchParams: SearchParamsInput,
  secret: string,
): Promise<ConsentRequest> {
  const query = signedOidcQuery(searchParams);
  if (!query) return { status: "invalid" };
  const restartUrl = authorizeUrlFrom(query);
  if (!(await verifyOAuthQueryParams(query, secret))) return { status: "expired", restartUrl };
  const params = new URLSearchParams(query);
  return {
    status: "valid",
    clientId: params.get("client_id") ?? "",
    scopes: consentScopes(params.get("scope")),
    restartUrl,
  };
}

/**
 * What /consent shows. Without a session (it expired, or someone opened the link elsewhere)
 * the request starts again, which leads through sign-in back here.
 */
export async function consentPageContext(
  searchParams: SearchParamsInput,
): Promise<ConsentPageContext> {
  const request = await readConsentRequest(searchParams, env().betterAuthSecret);
  if (request.status !== "valid") return request;

  const session = await getSession();
  if (!session) redirectToSafePath(request.restartUrl);

  const client = await getOAuthClientPublicInfo(db, request.clientId);
  if (!client || client.disabled) return { status: "invalid" };

  return {
    status: "ready",
    clientName: client.name ?? client.clientId,
    scopes: request.scopes,
    email: session.user.email,
    restartUrl: request.restartUrl,
    oidcQuery: signedOidcQuery(searchParams),
  };
}
