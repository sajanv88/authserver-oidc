import { EncryptJWT, jwtDecrypt } from "jose";

// This app's own cookies (the sign-in in progress, the session) are encrypted JWTs: A256GCM
// with a key derived from EXAMPLE_SESSION_SECRET and the cookie's purpose, so one kind can't
// be passed off as the other, and nothing in them can be read or changed in the browser.

async function keyFor(secret: string, purpose: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`example-client:${purpose}:${secret}`),
  );
  return new Uint8Array(digest);
}

export async function seal(
  payload: Record<string, unknown>,
  options: { secret: string; purpose: string; maxAgeSeconds: number },
): Promise<string> {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${options.maxAgeSeconds}s`)
    .encrypt(await keyFor(options.secret, options.purpose));
}

/** The payload, or undefined if the value is missing, altered, for another purpose or expired. */
export async function unseal(
  value: string | undefined,
  options: { secret: string; purpose: string },
): Promise<Record<string, unknown> | undefined> {
  if (!value) return undefined;
  try {
    const { payload } = await jwtDecrypt(value, await keyFor(options.secret, options.purpose));
    return payload;
  } catch {
    return undefined;
  }
}
