import { createHmac } from "node:crypto";
import { expect } from "@playwright/test";
import { authApi, type Person } from "./people";

// The authenticator app: TOTP codes (RFC 6238, SHA-1, 6 digits, 30 seconds) computed here,
// independently of the server, from the setup key the server shows.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** The current code for a base32 setup key, as an authenticator app shows it. */
export function totp(setupKey: string, at = Date.now()): string {
  const bits = [...setupKey.replace(/[\s=]/g, "").toUpperCase()]
    .map((char) => BASE32.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export function setupKeyOf(totpURI: string): string {
  return new URL(totpURI).searchParams.get("secret") ?? "";
}

export type TwoFactor = { setupKey: string; backupCodes: string[] };

/**
 * Turns two-factor on for `person` through the public API, as the security page does: the
 * password, then a code from the app to confirm. Leaves no session behind.
 */
export async function turnOnTwoFactor(person: Person): Promise<TwoFactor> {
  const api = await authApi();
  try {
    const signIn = await api.post("/api/auth/sign-in/email", {
      data: { email: person.email, password: person.password },
    });
    expect(signIn.ok(), `sign-in: ${await signIn.text()}`).toBe(true);
    const enable = await api.post("/api/auth/two-factor/enable", {
      data: { password: person.password },
    });
    expect(enable.ok(), `enable: ${await enable.text()}`).toBe(true);
    const { totpURI, backupCodes } = (await enable.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    const setupKey = setupKeyOf(totpURI);
    const confirm = await api.post("/api/auth/two-factor/verify-totp", {
      data: { code: totp(setupKey) },
    });
    expect(confirm.ok(), `verify-totp: ${await confirm.text()}`).toBe(true);
    await api.post("/api/auth/sign-out");
    return { setupKey, backupCodes };
  } finally {
    await api.dispose();
  }
}
