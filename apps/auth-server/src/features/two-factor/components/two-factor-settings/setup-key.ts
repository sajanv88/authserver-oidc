/**
 * The setup key an authenticator app asks for when the QR code can't be scanned: the base32
 * secret from the otpauth:// URI, in groups of four so it can be typed. Empty if there's none.
 */
export function setupKeyFrom(totpURI: string): string {
  let secret = "";
  try {
    secret = new URL(totpURI).searchParams.get("secret") ?? "";
  } catch {
    return "";
  }
  return (
    secret
      .replace(/\s+/g, "")
      .toUpperCase()
      .match(/.{1,4}/g)
      ?.join(" ") ?? ""
  );
}
