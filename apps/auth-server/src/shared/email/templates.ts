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
  /** The product's name (APP_NAME): the sign-off, and the subject's suffix. */
  appName: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  note: string;
};

function render({ appName, subject, intro, action, url, note }: Template): EmailContent {
  const ignore = "If you didn't ask for this, you can ignore this email.";
  const text = [intro, "", `${action}:`, url, "", note, ignore, "", appName].join("\n");
  const safeUrl = escapeHtml(url);
  const html = [
    "<!doctype html>",
    '<html lang="en"><body>',
    `<p>${escapeHtml(intro)}</p>`,
    `<p><a href="${safeUrl}">${escapeHtml(action)}</a></p>`,
    `<p>Or copy this address into your browser:<br>${safeUrl}</p>`,
    `<p>${escapeHtml(note)} ${escapeHtml(ignore)}</p>`,
    `<p>${escapeHtml(appName)}</p>`,
    "</body></html>",
  ].join("\n");
  return { subject: `${subject} · ${appName}`, text, html };
}

const minutes = (value: number) => `${value} minute${value === 1 ? "" : "s"}`;

export function verifyEmailTemplate({
  url,
  expiresInMinutes,
  appName,
}: {
  appName: string;
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    appName,
    subject: "Confirm your email address",
    intro: `Confirm your email address to finish creating your ${appName} account.`,
    action: "Confirm email address",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}.`,
  });
}

export function resetPasswordTemplate({
  url,
  expiresInMinutes,
  appName,
}: {
  appName: string;
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    appName,
    subject: "Reset your password",
    intro: `Someone asked to reset the password for your ${appName} account.`,
    action: "Choose a new password",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}. Resetting signs you out everywhere.`,
  });
}

export function magicLinkTemplate({
  url,
  expiresInMinutes,
  appName,
}: {
  appName: string;
  url: string;
  expiresInMinutes: number;
}): EmailContent {
  return render({
    appName,
    subject: "Your sign-in link",
    intro: `Use this link to sign in to ${appName}.`,
    action: "Sign in",
    url,
    note: `The link works once, for ${minutes(expiresInMinutes)}.`,
  });
}

/** To the owner of an address someone tried to sign up with again. */
export function existingAccountTemplate({
  loginUrl,
  resetUrl,
  appName,
}: {
  appName: string;
  loginUrl: string;
  resetUrl: string;
}): EmailContent {
  return render({
    appName,
    subject: "You already have an account",
    intro: `Someone tried to create a ${appName} account with this email address, which already has one. No new account was made.`,
    action: "Sign in",
    url: loginUrl,
    note: `Forgot your password? Choose a new one at ${resetUrl}.`,
  });
}
