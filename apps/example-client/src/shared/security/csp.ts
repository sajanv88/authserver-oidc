// The Content-Security-Policy every document gets, with a fresh nonce per request (proxy.ts).
// What each line allows, and why:
//  - script-src: only scripts carrying this response's nonce, and what they load
//    ('strict-dynamic'). Next stamps the nonce on its own scripts. Development adds
//    'unsafe-eval' for React's dev tooling; production never has it.
//  - style-src: the stylesheets, plus nuvui's one <style> element (ScrollArea) by nonce.
//    Development allows inline styles for hot reloading.
//  - style-src-attr 'unsafe-inline': nuvui components render some styles as style
//    attributes on the server (nuvui's CSP guide). An attribute can't select other elements.
//  - img-src blob: data:: nuvui's QR code download and file previews.
//  - form-action 'self' and the auth server: Sign out of the auth server too posts here and
//    is redirected there, and form-action covers the redirect. No other place.
//  - frame-ancestors 'none', base-uri 'self', object-src 'none': no framing, no <base>
//    hijack, no plugins.

/** The auth server's origin from the environment, for form-action; undefined if unusable. */
export function authServerOrigin(source: Record<string, string | undefined>): string | undefined {
  const value = source.EXAMPLE_AUTH_SERVER_URL?.trim();
  if (!value || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  return url.protocol === "https:" || url.protocol === "http:" ? url.origin : undefined;
}

export function buildContentSecurityPolicy({
  nonce,
  isDev,
  authServer,
}: {
  nonce: string;
  isDev: boolean;
  authServer?: string | undefined;
}): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self'${authServer ? ` ${authServer}` : ""}`,
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64: unguessable, and fresh for every response. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
