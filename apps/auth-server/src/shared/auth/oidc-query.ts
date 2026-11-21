// Carrying an OIDC authorization request through the auth pages.
//
// When a client sends someone to /api/auth/oauth2/authorize without a session, Better Auth
// redirects to the login page with the request's parameters plus a signature (`sig`, `exp`,
// `ba_iat`, `ba_param`). Two ways to get back into the flow:
//
// 1. Right away (sign-in, 2FA, consent): keep the signed query on the URL of every auth page.
//    The browser auth client sends it along with sign-in, and Better Auth continues the flow.
// 2. Later (after an email round trip, when the signature has expired): start a fresh
//    authorization request with the same parameters. The server checks the client, the
//    redirect URI, PKCE and scopes again from scratch, so nothing is trusted from the link.

export type SearchParamsInput =
  | URLSearchParams
  | string
  | Record<string, string | string[] | undefined>;

/** Parameters of an authorization request this server accepts (OAuth 2.1, OIDC Core). */
const AUTHORIZE_PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "nonce",
  "code_challenge",
  "code_challenge_method",
  "prompt",
  "max_age",
  "login_hint",
  "ui_locales",
  "acr_values",
  "resource",
] as const;

export const AUTHORIZE_PATH = "/api/auth/oauth2/authorize";

function toParams(input: SearchParamsInput): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      params.append(key, item);
    }
  }
  return params;
}

/**
 * The signed authorization query Better Auth put on this page's URL, unchanged, to pass on to
 * the next auth page. Empty when the page wasn't reached from an authorization request.
 */
export function signedOidcQuery(input: SearchParamsInput): string {
  const params = toParams(input);
  return params.has("sig") && params.has("client_id") ? params.toString() : "";
}

/**
 * A fresh authorization request with the same parameters, for resuming once the signed query
 * has expired. Undefined when there's no authorization request to resume.
 */
export function authorizeUrlFrom(input: SearchParamsInput): string | undefined {
  const params = toParams(input);
  if (!params.get("client_id") || !params.get("response_type")) return undefined;
  const fresh = new URLSearchParams();
  for (const key of AUTHORIZE_PARAMS) {
    for (const value of params.getAll(key)) fresh.append(key, value);
  }
  return `${AUTHORIZE_PATH}?${fresh.toString()}`;
}
