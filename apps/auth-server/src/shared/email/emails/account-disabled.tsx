import { type Brand, EmailLayout, EmailNote, EmailText } from "../components/email-layout";

export type AccountDisabledProps = Brand & {
  /** When it opens again by itself, as the email says it ("1 December 2026"), or none. */
  until?: string | undefined;
};

export const accountDisabledSubject = "Your account has been disabled";

/** To someone whose account an admin disabled. Never the admin's reason: that's theirs. */
export default function AccountDisabled({ appName, logoUrl, until }: AccountDisabledProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`An administrator disabled your ${appName} account.`}
      heading={accountDisabledSubject}
    >
      <EmailText>
        An administrator disabled your {appName} account. You've been signed out everywhere, and
        apps you signed in to with it can no longer act for you.
      </EmailText>
      <EmailText>
        {until
          ? `You can sign in again from ${until}.`
          : "You can't sign in until an administrator enables it again."}
      </EmailText>
      <EmailNote>If you think this is a mistake, ask your administrator.</EmailNote>
    </EmailLayout>
  );
}

AccountDisabled.PreviewProps = {
  appName: "Next-Identity Server",
  until: "1 December 2026",
} satisfies AccountDisabledProps;
