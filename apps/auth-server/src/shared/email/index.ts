import "server-only";
import { env } from "../config/env";
import { createConsoleProvider } from "./console-provider";
import { createSmtpProvider } from "./smtp-provider";
import type { EmailContent, EmailMessage, EmailProvider } from "./types";

export type { Brand } from "./components/email-layout";
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
 * Renders and sends without making the caller wait. Auth responses must take the same time
 * whether or not an email went out, or the timing tells an attacker which addresses have
 * accounts (Better Auth's guidance for sendVerificationEmail, sendResetPassword and
 * sendMagicLink), so `email` is the template's promise, not yet awaited. A failure is logged
 * with the subject (once rendered) and the recipient's domain only.
 */
export function sendEmailInBackground(to: string, email: Promise<EmailContent>): void {
  let subject: string | undefined;
  email
    .then((content) => {
      subject = content.subject;
      return sendEmail({ to, ...content });
    })
    .catch((error: unknown) => {
      console.error(
        JSON.stringify({
          level: "error",
          msg: subject ? "email send failed" : "email render failed",
          subject,
          recipientDomain: to.split("@").at(-1),
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
}
