import "server-only";
import { captchaToken } from "@/shared/auth/captcha";
import { env } from "@/shared/config/env";
import { turnstileHostnames, verifyTurnstileToken } from "./turnstile";

/**
 * Turnstile for an admin form, when it's on. The captcha plugin checks the endpoints in
 * CAPTCHA_ENDPOINTS itself; the admin forms reach the OAuth plugin's server API or the admin
 * endpoints, which it doesn't guard, so their actions check the form's token here.
 */
export async function formPassesTurnstile(form: FormData): Promise<boolean> {
  const config = env();
  if (!config.turnstile) return true;
  return verifyTurnstileToken(config.turnstile, captchaToken(form), turnstileHostnames(config));
}
