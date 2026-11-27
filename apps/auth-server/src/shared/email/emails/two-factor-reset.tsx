import {
  type Brand,
  EmailAction,
  EmailLayout,
  EmailNote,
  EmailText,
} from "../components/email-layout";

export type TwoFactorResetProps = Brand & {
  /** Where two-factor is set up again. */
  settingsUrl: string;
  /** Whether it's required of them, so they set it up again at their next sign-in. */
  required: boolean;
};

export const twoFactorResetSubject = "Two-factor authentication was turned off";

/**
 * To someone whose two-factor an admin reset, usually because they lost their phone. If they
 * didn't ask for it, it's the email that tells them something is wrong.
 */
export default function TwoFactorReset({
  appName,
  logoUrl,
  settingsUrl,
  required,
}: TwoFactorResetProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`An administrator turned off two-factor authentication for your ${appName} account.`}
      heading={twoFactorResetSubject}
    >
      <EmailText>
        An administrator turned off two-factor authentication for your {appName} account. Your
        authenticator app and backup codes no longer work for it.
      </EmailText>
      <EmailText>
        {required
          ? "It's required for your account, so you'll set it up again the next time you sign in."
          : "Set it up again to keep your account safe."}
      </EmailText>
      <EmailAction href={settingsUrl}>Set up two-factor</EmailAction>
      <EmailNote>
        If you didn't ask for this, tell your administrator now: someone may be trying to get into
        your account.
      </EmailNote>
    </EmailLayout>
  );
}

TwoFactorReset.PreviewProps = {
  appName: "Next-Identity Server",
  settingsUrl: "http://auth.localtest.me:3000/account/security/two-factor",
  required: true,
} satisfies TwoFactorResetProps;
