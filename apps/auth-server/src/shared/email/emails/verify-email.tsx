import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
  IGNORE_IF_NOT_YOU,
  minutes,
} from "../components/email-layout";

export type VerifyEmailProps = Brand & { url: string; expiresInMinutes: number };

export const verifyEmailSubject = "Confirm your email address";

export default function VerifyEmail({ appName, logoUrl, url, expiresInMinutes }: VerifyEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`Confirm your email address to finish creating your ${appName} account.`}
      heading={verifyEmailSubject}
    >
      <EmailText>Confirm your email address to finish creating your {appName} account.</EmailText>
      <EmailAction href={url}>Confirm email address</EmailAction>
      <EmailNote>
        The link works once, for {minutes(expiresInMinutes)}. {IGNORE_IF_NOT_YOU}
      </EmailNote>
    </EmailLayout>
  );
}

VerifyEmail.PreviewProps = {
  appName: "Next-Identity Server",
  url: "http://auth.localtest.me:3000/api/auth/verify-email?token=preview&callbackURL=%2F",
  expiresInMinutes: 60,
} satisfies VerifyEmailProps;
