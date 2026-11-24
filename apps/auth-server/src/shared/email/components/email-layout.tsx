import type { ReactNode } from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

// Email clients ignore stylesheets and CSS variables, so every style is inline, in hex: nuvui's
// default light theme (Tailwind's palette), the colours of the sign-in pages.
const color = {
  background: "#f9fafb", // gray-50
  surface: "#ffffff",
  foreground: "#030712", // gray-950
  muted: "#4a5565", // gray-600
  border: "#e5e7eb", // gray-200
  primary: "#155dfc", // blue-600
  primaryForeground: "#ffffff",
};

const font =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

/** Who the email is from: APP_NAME, and LOGO_URL when it's set. */
export type Brand = {
  appName: string;
  logoUrl?: string | undefined;
};

/** One minute, 15 minutes. */
export function minutes(value: number): string {
  return `${value} minute${value === 1 ? "" : "s"}`;
}

export const IGNORE_IF_NOT_YOU = "If you didn't ask for this, you can ignore this email.";

/**
 * Gmail and Outlook don't show SVG images, so an SVG logo is left out and the name stands
 * alone, as it does when there's no logo.
 */
function emailLogo(logoUrl: string | undefined): string | undefined {
  if (!logoUrl) return undefined;
  return new URL(logoUrl).pathname.toLowerCase().endsWith(".svg") ? undefined : logoUrl;
}

/**
 * Every email: the inbox preview line, the logo and name, a heading, the content, and the name
 * again as the sign-off. The header is left out of the plain-text part, which starts at the
 * heading.
 */
export function EmailLayout({
  appName,
  logoUrl,
  preview,
  heading,
  children,
}: Brand & { preview: string; heading: string; children: ReactNode }) {
  const logo = emailLogo(logoUrl);
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, backgroundColor: color.background, fontFamily: font }}>
        <Container style={{ maxWidth: 560, padding: "32px 16px" }}>
          <Section data-skip-in-text="true" style={{ paddingBottom: 16 }}>
            {logo ? (
              <Img
                src={logo}
                alt=""
                height={32}
                style={{ display: "inline-block", height: 32, width: "auto", marginRight: 8 }}
              />
            ) : null}
            <span
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: color.foreground,
                verticalAlign: "middle",
              }}
            >
              {appName}
            </span>
          </Section>
          <Section
            style={{
              backgroundColor: color.surface,
              border: `1px solid ${color.border}`,
              borderRadius: 8,
              padding: "32px 32px 16px",
            }}
          >
            <Heading
              as="h1"
              style={{
                margin: "0 0 16px",
                fontSize: 20,
                lineHeight: "28px",
                fontWeight: 600,
                color: color.foreground,
              }}
            >
              {heading}
            </Heading>
            {children}
          </Section>
          <Text
            style={{ margin: "16px 0 0", fontSize: 12, lineHeight: "16px", color: color.muted }}
          >
            {appName}
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** A paragraph of the email's body. */
export function EmailText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: "0 0 16px", fontSize: 14, lineHeight: "20px", color: color.foreground }}>
      {children}
    </Text>
  );
}

/** The small print under the action: how long the link works, what to do if it wasn't you. */
export function EmailNote({ children }: { children: ReactNode }) {
  return (
    <Text style={{ margin: "0 0 16px", fontSize: 12, lineHeight: "16px", color: color.muted }}>
      {children}
    </Text>
  );
}

/**
 * The one thing to do: a button, and the address to copy for when the button doesn't work. The
 * plain-text part keeps the button's label and address ("Sign in https://…"), not the copy.
 */
export function EmailAction({ href, children }: { href: string; children: string }) {
  return (
    <>
      <Section style={{ margin: "8px 0 24px" }}>
        <Button
          href={href}
          style={{
            backgroundColor: color.primary,
            color: color.primaryForeground,
            borderRadius: 6,
            padding: "10px 16px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          {children}
        </Button>
      </Section>
      <Text
        data-skip-in-text="true"
        style={{ margin: "0 0 16px", fontSize: 12, lineHeight: "16px", color: color.muted }}
      >
        Or copy this address into your browser:
        <br />
        <Link href={href} style={{ color: color.primary, wordBreak: "break-all" }}>
          {href}
        </Link>
      </Text>
      <Hr
        data-skip-in-text="true"
        style={{ borderTop: `1px solid ${color.border}`, margin: "0 0 16px" }}
      />
    </>
  );
}
