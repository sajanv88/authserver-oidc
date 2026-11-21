import { createTransport } from "nodemailer";
import type { EmailConfig } from "../config/env-schema";
import type { EmailMessage, EmailProvider } from "./types";

type SmtpConfig = Extract<EmailConfig, { provider: "smtp" }>;

/**
 * Transport options for an SMTP relay (Cloudflare's, or any other). Always encrypted with a
 * verified certificate: port 465 is TLS from the first byte, every other port must upgrade with
 * STARTTLS or the connection fails. Nothing is ever sent in the clear.
 */
export function smtpTransportOptions(config: SmtpConfig) {
  const implicitTls = config.port === 465;
  return {
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: config.user, pass: config.password },
    tls: { minVersion: "TLSv1.2" as const, rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

export function createSmtpProvider(config: SmtpConfig): EmailProvider {
  const transport = createTransport(smtpTransportOptions(config));
  return {
    name: "smtp",
    async send(message: EmailMessage) {
      await transport.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    },
  };
}
