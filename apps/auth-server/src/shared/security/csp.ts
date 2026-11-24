// The Content-Security-Policy every document gets, with a fresh nonce per request (proxy.ts).
// What each line allows, and why:
//  - script-src: only scripts carrying this response's nonce, and what they load
//    ('strict-dynamic'). Next stamps the nonce on its own scripts. Development adds
//    'unsafe-eval' for React's dev tooling; production never has it.
//  - style-src: the stylesheets, plus nuvui's one <style> element (ScrollArea) by nonce.
//    Development allows inline styles for hot reloading.
//  - style-src-attr 'unsafe-inline': nuvui components render some styles as style
//    attributes on the server (nuvui's CSP guide). An attribute can't select other elements.
//  - img-src blob: data:: nuvui's QR code download and file previews. With LOGO_URL set, and
//    only then, the logo's origin too.
//  - connect-src 'self': the auth forms only talk to this origin.
//  - form-action 'self', frame-ancestors 'none', base-uri 'self', object-src 'none':
//    no posting forms elsewhere, no framing (clickjacking on login and consent), no <base>
//    hijack, no plugins.
//  - With Cloudflare Turnstile configured, and only then: its script (loaded by ours, so
//    'strict-dynamic' allows it; the origin is for browsers without 'strict-dynamic') and its
//    widget's iframe (frame-src).

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * Whether Turnstile is configured, from the raw variables: proxy.ts runs before every document
 * and doesn't import env() (server-only, and the whole schema). Half a configuration counts as
 * none here; env() refuses it (env-schema.ts).
 */
export function isTurnstileConfigured(source: Record<string, string | undefined>): boolean {
  return Boolean(source.TURNSTILE_SITE_KEY?.trim() && source.TURNSTILE_SECRET_KEY?.trim());
}

/**
 * The origin of LOGO_URL, for img-src, from the raw variables (like isTurnstileConfigured).
 * Undefined when it's unset or isn't an http(s) URL: env() refuses those at startup.
 */
export function logoOrigin(source: Record<string, string | undefined>): string | undefined {
  const value = source.LOGO_URL?.trim();
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
}

export function buildContentSecurityPolicy({
  nonce,
  isDev,
  turnstile = false,
  logo,
}: {
  nonce: string;
  isDev: boolean;
  turnstile?: boolean;
  /** LOGO_URL's origin, allowed as an image source only when it's set. */
  logo?: string | undefined;
}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}${turnstile ? ` ${TURNSTILE_ORIGIN}` : ""}`,
    ...(turnstile ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' blob: data:${logo ? ` ${logo}` : ""}`,
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64: unguessable, and fresh for every response. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
