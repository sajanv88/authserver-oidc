import { EncryptJWT, jwtDecrypt } from "jose";

// This app's cookies are encrypted JWTs (A256GCM, "dir"): nothing in them can be read or
// changed in the browser. Each kind of cookie has its own key, derived with HKDF from the
// secret and the cookie's purpose, so a sign-in cookie can't be passed off as a session.

const encoder = new TextEncoder();
const SALT = encoder.encode("nextidp sealed cookie");

async function deriveKey(secret: string, purpose: string): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: encoder.encode(purpose) },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/** Seals and opens values for one `idp()` instance; derived keys are kept, not recomputed. */
export class Sealer {
  readonly #secrets: readonly string[];
  readonly #keys = new Map<string, Promise<Uint8Array>>();

  constructor(secrets: readonly string[]) {
    this.#secrets = secrets;
  }

  #key(secret: string, purpose: string): Promise<Uint8Array> {
    const id = `${purpose}\u0000${secret}`;
    let key = this.#keys.get(id);
    if (!key) {
      key = deriveKey(secret, purpose);
      this.#keys.set(id, key);
    }
    return key;
  }

  /** Encrypts with the first secret. */
  async seal(
    payload: Record<string, unknown>,
    purpose: string,
    maxAgeSeconds: number,
  ): Promise<string> {
    const [secret] = this.#secrets;
    if (secret === undefined) throw new Error("No secret to seal with.");
    return new EncryptJWT(payload)
      .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
      .setIssuedAt()
      .setExpirationTime(`${maxAgeSeconds}s`)
      .encrypt(await this.#key(secret, purpose));
  }

  /**
   * The payload, or undefined if the value is missing, altered, sealed for another purpose,
   * expired, or sealed with a secret no longer in the list. Tries every secret, in order.
   */
  async unseal(
    value: string | undefined,
    purpose: string,
  ): Promise<Record<string, unknown> | undefined> {
    if (!value) return undefined;
    for (const secret of this.#secrets) {
      try {
        const { payload } = await jwtDecrypt(value, await this.#key(secret, purpose));
        return payload;
      } catch {
        // Another secret may have sealed it.
      }
    }
    return undefined;
  }
}
