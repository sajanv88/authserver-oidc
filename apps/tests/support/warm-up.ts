import { APP_URL, AUTH_URL } from "./env";

// Runs once, after both dev servers answer and before any test: asks for every page so each
// route is compiled once here rather than inside a test's timeout.
const PAGES = [
  `${AUTH_URL}/login`,
  `${AUTH_URL}/signup`,
  `${AUTH_URL}/magic-link`,
  `${AUTH_URL}/forgot-password`,
  `${AUTH_URL}/reset-password`,
  `${AUTH_URL}/verify-email`,
  `${AUTH_URL}/two-factor`,
  `${AUTH_URL}/consent`,
  `${AUTH_URL}/account/security`,
  `${AUTH_URL}/admin/clients`,
  `${AUTH_URL}/.well-known/openid-configuration`,
  `${AUTH_URL}/jwks`,
  `${APP_URL}/`,
  `${APP_URL}/me`,
];

export default async function warmUp(): Promise<void> {
  for (const url of PAGES) {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(120_000) }).catch(
      () => undefined,
    );
  }
}
