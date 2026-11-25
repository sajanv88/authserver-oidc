import { type Brand, EmailLayout, EmailNote, EmailText } from "../components/email-layout";

export type AccountDeletedProps = Brand;

export const accountDeletedSubject = "Your account has been deleted";

/** To someone whose account an admin deleted: the last email this server sends them. */
export default function AccountDeleted({ appName, logoUrl }: AccountDeletedProps) {
  return (
    <EmailLayout
      appName={appName}
      logoUrl={logoUrl}
      preview={`Your ${appName} account has been deleted.`}
      heading={accountDeletedSubject}
    >
      <EmailText>
        An administrator deleted your {appName} account. Your profile, sign-in methods, sessions and
        the access you gave apps have been removed, and can't be brought back.
      </EmailText>
      <EmailNote>
        If you think this is a mistake, ask your administrator. You can sign up again with this
        email address.
      </EmailNote>
    </EmailLayout>
  );
}

AccountDeleted.PreviewProps = { appName: "Auth Server" } satisfies AccountDeletedProps;
