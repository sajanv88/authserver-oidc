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
//  - connect-src 'self': the auth forms only talk to this origin.
//  - form-action 'self', frame-ancestors 'none', base-uri 'self', object-src 'none':
//    no posting forms elsewhere, no framing (clickjacking on login and consent), no <base>
//    hijack, no plugins.

export function buildContentSecurityPolicy({
  nonce,
  isDev,
}: {
  nonce: string;
  isDev: boolean;
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
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 128 random bits, base64: unguessable, and fresh for every response. */
export function createNonce(): string {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
}
