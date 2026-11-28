import type { LegalLinks } from "@/shared/config/env";
import { ExternalTextLink } from "@/shared/ui/text-link/text-link";
import "./legal-notice.scss";

type LegalNoticeProps = LegalLinks & {
  /** What the person is doing, to begin the sentence: "By signing in". */
  action: string;
};

/**
 * The privacy policy and terms of service under a sign-in or sign-up form, in one sentence.
 * Only what's configured is named, and nothing at all when neither is.
 */
export function LegalNotice({ action, privacyPolicyUrl, termsOfServiceUrl }: LegalNoticeProps) {
  const terms = termsOfServiceUrl ? (
    <ExternalTextLink href={termsOfServiceUrl}>terms of service</ExternalTextLink>
  ) : null;
  const privacy = privacyPolicyUrl ? (
    <ExternalTextLink href={privacyPolicyUrl}>privacy policy</ExternalTextLink>
  ) : null;
  if (!terms && !privacy) return null;
  return (
    <p className="legal-notice">
      {terms && privacy ? (
        <>
          {action}, you agree to the {terms} and the {privacy}.
        </>
      ) : terms ? (
        <>
          {action}, you agree to the {terms}.
        </>
      ) : (
        <>See the {privacy} for how your data is used.</>
      )}
    </p>
  );
}
