import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
  IGNORE_IF_NOT_YOU,
  minutes,
} from "../components/email-layout";

export type MagicLinkProps = Brand & { url: string; expiresInMinutes: number };

export const magicLinkSubject = "Your sign-in link";

export default function MagicLink({ appName, logoUrl, url, expiresInMinutes }: MagicLinkProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`Use this link to sign in to ${appName}.`}
      heading={magicLinkSubject}
    >
      <EmailText>Use this link to sign in to {appName}.</EmailText>
      <EmailAction href={url}>Sign in</EmailAction>
      <EmailNote>
        The link works once, for {minutes(expiresInMinutes)}. {IGNORE_IF_NOT_YOU}
      </EmailNote>
    </EmailLayout>
  );
}

MagicLink.PreviewProps = {
  appName: "Auth Server",
  url: "http://auth.localtest.me:3000/api/auth/magic-link/verify?token=preview&callbackURL=%2F",
  expiresInMinutes: 5,
} satisfies MagicLinkProps;
