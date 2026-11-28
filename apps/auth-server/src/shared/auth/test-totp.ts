// Test-only: the current code for an otpauth:// URI, computed by an RFC 6238 implementation of
// our own (SHA-1, as the URI says), as an authenticator app computes it from the QR code. Tests
// that use it also check that real authenticator apps work.
import { createHmac } from "node:crypto";

export function totp(uri: string, at = Date.now()): string {
  const url = new URL(uri);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...(url.searchParams.get("secret") ?? "").toUpperCase()]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const period = Number(url.searchParams.get("period") ?? 30);
  const digits = Number(url.searchParams.get("digits") ?? 6);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / period)));
  const hmac = createHmac("sha1", key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, "0");
}
