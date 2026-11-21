import "server-only";
import { env } from "../config/env";
import { createConsoleProvider } from "./console-provider";
import { createSmtpProvider } from "./smtp-provider";
import type { EmailMessage, EmailProvider } from "./types";

export {
  existingAccountTemplate,
  magicLinkTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from "./templates";
export type { EmailContent, EmailMessage, EmailProvider } from "./types";

let provider: EmailProvider | undefined;

/** The provider the environment selects, created once per process. */
export function emailProvider(): EmailProvider {
  if (provider) return provider;
  const config = env().email;
  provider = config.provider === "smtp" ? createSmtpProvider(config) : createConsoleProvider();
  return provider;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await emailProvider().send(message);
}

/**
 * Sends without making the caller wait. Auth responses must take the same time whether or not
 * an email went out, or the timing tells an attacker which addresses have accounts (Better
 * Auth's guidance for sendVerificationEmail, sendResetPassword and sendMagicLink). A failure is
 * logged with the subject and the recipient's domain only.
 */
export function sendEmailInBackground(message: EmailMessage): void {
  sendEmail(message).catch((error: unknown) => {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "email send failed",
        subject: message.subject,
        recipientDomain: message.to.split("@").at(-1),
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}
