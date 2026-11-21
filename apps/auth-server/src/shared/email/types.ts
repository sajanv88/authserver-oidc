/** What a template produces: one email, in plain text and HTML. */
export type EmailContent = {
  subject: string;
  text: string;
  html: string;
};

export type EmailMessage = EmailContent & {
  to: string;
};

/**
 * Where emails go. `console` in development (printed to the server log), `smtp` in production.
 * `send` resolves once the provider has accepted the message, and throws when it hasn't.
 */
export type EmailProvider = {
  readonly name: "console" | "smtp";
  send(message: EmailMessage): Promise<void>;
};
