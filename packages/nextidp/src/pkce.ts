import { base64url } from "jose";

/** 256 random bits, base64url: a PKCE verifier (RFC 7636 4.1), a state or a nonce. */
export function randomToken(): string {
  return base64url.encode(crypto.getRandomValues(new Uint8Array(32)));
}

/** The S256 code challenge for a verifier: base64url(SHA-256(verifier)). */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

/** Compares two strings without leaking where they differ through timing. */
export function sameString(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}
