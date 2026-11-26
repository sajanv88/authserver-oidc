const PLACEHOLDER = "http://nextidp.invalid";

/**
 * A path of this app, or undefined. Where a sign-in returns to comes from the browser
 * (`?returnTo=`, a form field), so anything that could lead to another site is refused:
 * `//evil.example`, `/\evil.example`, `https://…`, `javascript:…`, and control characters.
 */
export function safePath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  // biome-ignore lint/suspicious/noControlCharactersInRegex: refusing them is the point.
  if (value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return undefined;
  }
  try {
    const url = new URL(value, PLACEHOLDER);
    if (url.origin !== PLACEHOLDER) return undefined;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return undefined;
  }
}
