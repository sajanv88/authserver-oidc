import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
} from "../components/email-layout";

export type AccountEnabledProps = Brand & { loginUrl: string };

export const accountEnabledSubject = "Your account is enabled again";

/** To someone whose disabled account an admin enabled. */
export default function AccountEnabled({ appName, logoUrl, loginUrl }: AccountEnabledProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`You can sign in to ${appName} again.`}
      heading={accountEnabledSubject}
    >
      <EmailText>
        An administrator enabled your {appName} account again. You can sign in as before.
      </EmailText>
      <EmailAction href={loginUrl}>Sign in</EmailAction>
      <EmailNote>If you think this is a mistake, ask your administrator.</EmailNote>
    </EmailLayout>
  );
}

AccountEnabled.PreviewProps = {
  appName: "Auth Server",
  loginUrl: "http://auth.localtest.me:3000/login",
} satisfies AccountEnabledProps;
