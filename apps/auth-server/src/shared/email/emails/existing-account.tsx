import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
  IGNORE_IF_NOT_YOU,
} from "../components/email-layout";

export type ExistingAccountProps = Brand & { loginUrl: string; resetUrl: string };

export const existingAccountSubject = "You already have an account";

/** To the owner of an address someone tried to sign up with again. */
export default function ExistingAccount({
  appName,
  logoUrl,
  loginUrl,
  resetUrl,
}: ExistingAccountProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`Someone tried to create a ${appName} account with this email address.`}
      heading={existingAccountSubject}
    >
      <EmailText>
        Someone tried to create a {appName} account with this email address, which already has one.
        No new account was made.
      </EmailText>
      <EmailAction href={loginUrl}>Sign in</EmailAction>
      {/* On its own line, so nothing sticks to the address in the plain-text part. */}
      <EmailNote>
        Forgot your password? Choose a new one at
        <br />
        {resetUrl}
      </EmailNote>
      <EmailNote>{IGNORE_IF_NOT_YOU}</EmailNote>
    </EmailLayout>
  );
}

ExistingAccount.PreviewProps = {
  appName: "Next-Identity Server",
  loginUrl: "http://auth.localtest.me:3000/login",
  resetUrl: "http://auth.localtest.me:3000/forgot-password",
} satisfies ExistingAccountProps;
