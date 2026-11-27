// Build-time constants about the product, the same in every environment. Per-environment
// values are runtime env vars (env.ts), never here.

/**
 * The product's name when APP_NAME isn't set. The name in use is `env().appName`: shown on
 * every auth page, in page titles and emails, and as the TOTP issuer.
 */
export const DEFAULT_APP_NAME = "Next-Identity Server";
