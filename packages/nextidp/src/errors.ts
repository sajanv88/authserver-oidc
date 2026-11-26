/**
 * Why a sign-in didn't finish. The app is sent to its `errorPath` with `?error=<code>`, so it
 * can say what happened; these are the only codes it ever gets there.
 */
export type SignInErrorCode =
  /** The person chose Deny on the auth server. */
  | "access_denied"
  /** The sign-in took longer than 10 minutes, or its cookie was lost. */
  | "expired"
  /** The answer wasn't for a sign-in this browser started. */
  | "state_mismatch"
  /** The auth server refused the code, or answered with an error. */
  | "token_failed"
  /** The ID token's signature, issuer, audience, expiry or nonce was wrong. */
  | "invalid_id_token"
  /** The refresh token was refused: used, revoked or expired. */
  | "refresh_failed";

export const SIGN_IN_ERROR_CODES: readonly SignInErrorCode[] = [
  "access_denied",
  "expired",
  "state_mismatch",
  "token_failed",
  "invalid_id_token",
  "refresh_failed",
];

export function isSignInErrorCode(value: unknown): value is SignInErrorCode {
  return typeof value === "string" && (SIGN_IN_ERROR_CODES as readonly string[]).includes(value);
}

export type IdpErrorCode =
  | SignInErrorCode
  /** A setting is missing or wrong: the message names it. */
  | "misconfigured"
  /** The auth server's discovery document couldn't be fetched or isn't valid. */
  | "discovery_failed"
  /** The userinfo endpoint refused the access token or didn't answer. */
  | "userinfo_failed"
  /** An API was called without an access token (401, no error code in the challenge). */
  | "missing_token"
  /** The access token is expired, revoked, for another API, or not valid at all (401). */
  | "invalid_token"
  /** The access token is valid but lacks a scope this route needs (403). */
  | "insufficient_scope";

/** The three codes an API answers a caller with; see `tokenErrorResponse`. */
export type TokenErrorCode = "missing_token" | "invalid_token" | "insufficient_scope";

export function isTokenError(error: unknown): error is IdpError & { code: TokenErrorCode } {
  return (
    isIdpError(error) &&
    (error.code === "missing_token" ||
      error.code === "invalid_token" ||
      error.code === "insufficient_scope")
  );
}

/**
 * Every error nextidp throws. Its message never holds a token, a secret or a claim.
 * Check it with `isIdpError`: `instanceof` can fail when an app loads both the ES module and
 * the CommonJS build.
 */
export class IdpError extends Error {
  override readonly name = "IdpError";
  readonly code: IdpErrorCode;
  /**
   * The HTTP status the auth server answered with, when there was one; for a token error,
   * the status to answer the caller with (401 or 403).
   */
  readonly status: number | undefined;
  /** For insufficient_scope: the scopes the route needs, for the WWW-Authenticate challenge. */
  readonly scopes: readonly string[] | undefined;

  constructor(
    code: IdpErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown; scopes?: readonly string[] },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = options?.status;
    this.scopes = options?.scopes;
  }
}

export function isIdpError(error: unknown): error is IdpError {
  return (
    error instanceof Error &&
    error.name === "IdpError" &&
    typeof (error as { code?: unknown }).code === "string"
  );
}
