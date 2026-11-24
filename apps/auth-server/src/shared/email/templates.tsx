import type { ReactElement } from "react";
import { render, toPlainText } from "react-email";
import ExistingAccount, {
  type ExistingAccountProps,
  existingAccountSubject,
} from "./emails/existing-account";
import MagicLink, { type MagicLinkProps, magicLinkSubject } from "./emails/magic-link";
import ResetPassword, {
  type ResetPasswordProps,
  resetPasswordSubject,
} from "./emails/reset-password";
import VerifyEmail, { type VerifyEmailProps, verifyEmailSubject } from "./emails/verify-email";
import type { EmailContent } from "./types";

// The emails are React Email components in ./emails (`pnpm email:dev` previews them). React
// escapes every value put into the HTML, the URLs Better Auth built included. The plain-text
// part is made from the same HTML, so the two always say the same thing.

const PLAIN_TEXT = {
  // html-to-text shouts headings by default.
  selectors: [{ selector: "h1", options: { uppercase: false } }],
};

async function renderEmail(
  subject: string,
  appName: string,
  email: ReactElement,
): Promise<EmailContent> {
  const html = await render(email);
  return { subject: `${subject} · ${appName}`, html, text: toPlainText(html, PLAIN_TEXT) };
}

export function verifyEmailTemplate(props: VerifyEmailProps): Promise<EmailContent> {
  return renderEmail(verifyEmailSubject, props.appName, <VerifyEmail {...props} />);
}

export function resetPasswordTemplate(props: ResetPasswordProps): Promise<EmailContent> {
  return renderEmail(resetPasswordSubject, props.appName, <ResetPassword {...props} />);
}

export function magicLinkTemplate(props: MagicLinkProps): Promise<EmailContent> {
  return renderEmail(magicLinkSubject, props.appName, <MagicLink {...props} />);
}

export function existingAccountTemplate(props: ExistingAccountProps): Promise<EmailContent> {
  return renderEmail(existingAccountSubject, props.appName, <ExistingAccount {...props} />);
}
