// nextidp: sign people in to an app with Next-Identity Server (or any OpenID Connect provider
// that supports the code flow with PKCE). This entry point has no framework in it: Web
// Request and Response in, Response out. `nextidp/next` adds Next.js on top.

export {
  type AccessToken,
  bearerChallenge,
  bearerToken,
  type TokenRequirements,
} from "./access-token.js";
export type { ApiConfig, IdpConfig, IdpOptions, ServiceConfig } from "./config.js";
export { DEFAULT_SCOPES } from "./config.js";
export {
  IdpError,
  type IdpErrorCode,
  isIdpError,
  isSignInErrorCode,
  isTokenError,
  SIGN_IN_ERROR_CODES,
  type SignInErrorCode,
  type TokenErrorCode,
} from "./errors.js";
export {
  type CookieSource,
  createIdp as idp,
  type Idp,
  type Refreshed,
  type SignInPathOptions,
} from "./idp.js";
export { safePath } from "./return-path.js";
export type {
  InterceptableClient,
  ServiceTokenOptions,
  UseServiceTokenOptions,
} from "./service.js";
export type { IdpUser, Session } from "./session.js";
export { memoryStore, type SessionStore } from "./store.js";
