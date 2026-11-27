import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
  IGNORE_IF_NOT_YOU,
  minutes,
} from "../components/email-layout";

export type ResetPasswordProps = Brand & { url: string; expiresInMinutes: number };

export const resetPasswordSubject = "Reset your password";

export default function ResetPassword({
  appName,
  logoUrl,
  url,
  expiresInMinutes,
}: ResetPasswordProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`Someone asked to reset the password for your ${appName} account.`}
      heading={resetPasswordSubject}
    >
      <EmailText>Someone asked to reset the password for your {appName} account.</EmailText>
      <EmailAction href={url}>Choose a new password</EmailAction>
      <EmailNote>
        The link works once, for {minutes(expiresInMinutes)}. Resetting signs you out everywhere.{" "}
        {IGNORE_IF_NOT_YOU}
      </EmailNote>
    </EmailLayout>
  );
}

ResetPassword.PreviewProps = {
  appName: "Next-Identity Server",
  url: "http://auth.localtest.me:3000/api/auth/reset-password/preview?callbackURL=%2Freset-password",
  expiresInMinutes: 15,
} satisfies ResetPasswordProps;
