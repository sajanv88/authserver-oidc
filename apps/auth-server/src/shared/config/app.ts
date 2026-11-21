// Build-time constants about the product, the same in every environment. Per-environment
// values are runtime env vars (env.ts), never here.

/** The product's name: shown on every auth page, in emails, and as the TOTP issuer. */
export const APP_NAME = "Auth Server";
