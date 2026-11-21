import type { EmailMessage, EmailProvider } from "./types";

/**
 * Development only: prints each email to the server log as one JSON line, so the link in it
 * can be followed. The env schema refuses this provider in production.
 */
export function createConsoleProvider(
  write: (line: string) => void = (line) => {
    // biome-ignore lint/suspicious/noConsole: this provider's whole job is to print the email
    console.info(line);
  },
): EmailProvider {
  return {
    name: "console",
    async send(message: EmailMessage) {
      write(
        JSON.stringify({
          level: "info",
          msg: "email (console provider, not sent)",
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
      );
    },
  };
}
