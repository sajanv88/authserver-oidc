import type { Auth } from "./auth-config";

// Running a Better Auth endpoint from server code, through `auth.handler` as if the browser had
// sent it. Not `auth.api.*`: the server API skips the rate limiter and the OIDC hooks that read
// `oauth_query`. Pure (the request's headers are passed in), so tests drive it directly;
// server-endpoint.ts is the Next.js wrapper the server actions use.

export type EndpointCall = {
  /** The endpoint under /api/auth, e.g. "/sign-in/email". */
  path: `/${string}`;
  body?: Record<string, unknown>;
  /** The signed OIDC query the page was opened with: lets Better Auth continue the flow. */
  oauthQuery?: string | undefined;
  /** The form's Turnstile token, for the captcha plugin (sent as X-Captcha-Response). */
  captcha?: string | undefined;
};

/** What the browser's request carried, passed on so Better Auth sees the same client. */
export type RequestContext = {
  cookie?: string | null | undefined;
  /** As the ingress set it: Better Auth takes the client IP from it (trusted proxies). */
  forwardedFor?: string | null | undefined;
  userAgent?: string | null | undefined;
};

/** A refusal, in the shape `authErrorMessage` reads. */
export type EndpointError = {
  status: number;
  /** Better Auth's error code (INVALID_PASSWORD, EMAIL_NOT_VERIFIED, …). */
  code?: string | undefined;
  /** An OAuth error (invalid_signature, invalid_request, …). */
  error?: string | undefined;
};

export type EndpointResult = (
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: EndpointError }
) & {
  status: number;
  /** The response's Set-Cookie headers, for the caller to hand to the browser. */
  setCookies: string[];
};

/** Runs one endpoint call. Something like a sign-in or a code check, never a navigation. */
export type AuthCaller = (call: EndpointCall) => Promise<EndpointResult>;

export async function callEndpoint(
  auth: Auth,
  baseUrl: string,
  context: RequestContext,
  call: EndpointCall,
): Promise<EndpointResult> {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json",
    // The request comes from this server's own form: the auth server's own origin.
    origin: baseUrl,
  });
  if (context.cookie) headers.set("cookie", context.cookie);
  if (context.forwardedFor) headers.set("x-forwarded-for", context.forwardedFor);
  if (context.userAgent) headers.set("user-agent", context.userAgent);
  if (call.captcha) headers.set("x-captcha-response", call.captcha);

  const body = {
    ...call.body,
    ...(call.oauthQuery ? { oauth_query: call.oauthQuery } : {}),
  };
  const response = await auth.handler(
    new Request(`${baseUrl}/api/auth${call.path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "manual",
    }),
  );

  const setCookies = response.headers.getSetCookie();
  const json: unknown = await response.json().catch(() => null);
  const data = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  if (response.ok) return { ok: true, data, status: response.status, setCookies };
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    ok: false,
    error: { status: response.status, code: text(data.code), error: text(data.error) },
    status: response.status,
    setCookies,
  };
}

/** Where Better Auth says an OIDC flow goes on: `{ redirect: true, url }`. */
export function continuationUrl(data: Record<string, unknown>): string | undefined {
  return data.redirect === true && typeof data.url === "string" ? data.url : undefined;
}
