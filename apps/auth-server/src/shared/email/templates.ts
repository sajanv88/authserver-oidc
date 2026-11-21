import { APP_NAME } from "../config/app";
import type { EmailContent } from "./types";

// Plain, unstyled emails: a sentence, the link, and what to do if it wasn't you. Every value
// put into the HTML is escaped, even the URL Better Auth built, so nothing in a name or a
// query string can inject markup.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

type Template = {
  subject: string;
  intro: string;
  action: string;
  url: string;
  note: string;
};

function render({ subject, intro, action, url, note }: Template): EmailContent {
  const ignore = "If you didn't ask for this, you can ignore this email.";
  const text = [intro, "", `${action}:`, url, "", note, ignore, "", APP_NAME].join("\n");
  const safeUrl = escapeHtml(url);
  const html = [
    "<!doctype html>",
    '<html lang="en"><body>',
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${safeUrl}">${escapeHtml(action)}</a></p>`,
    `<p>Or copy this address into your browser:<br>${safeUrl}</p>`,
    `<p>${escapeHtml(note)} ${escapeHtml(ignore)}</p>`,
    `<p>${escapeHtml(APP_NAME)}</p>`,
    "</body></html>",
  ].join("\n");
  return { subject: `${subject} · ${APP_NAME}`, text, html };
}

const minutes = (value: number) => `${value} minute${value === 1 ? "" : "s"}`;

export function verifyEmailTemplate({
  url,
  expiresInMinutes,
}: {
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    subject: "Confirm your email address",
    intro: `Confirm your email address to finish creating your ${APP_NAME} account.`,
    action: "Confirm email address",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}.`,
  });
}

export function resetPasswordTemplate({
  url,
  expiresInMinutes,
}: {
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    subject: "Reset your password",
    intro: `Someone asked to reset the password for your ${APP_NAME} account.`,
    action: "Choose a new password",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}. Resetting signs you out everywhere.`,
  });
}

export function magicLinkTemplate({
  url,
  expiresInMinutes,
}: {
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    subject: "Your sign-in link",
    intro: `Use this link to sign in to ${APP_NAME}.`,
    action: "Sign in",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}.`,
  });
}
