import "@nuvui/react/styles.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/backgrounds/styles.css";
import "@nuvui/chat/styles.css";
import "@nuvui/table/styles.css";
import "@/styles/globals.scss";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { APPLY_STORED_APPEARANCE } from "@/components/appearance-menu/appearance";
import { OG_IMAGE, PRODUCT_NAME } from "@/content/site";

const description =
  "A self-hosted OpenID Connect server for your own apps: sign-in, two-factor, consent and an admin for clients, on Next.js 16 and Better Auth, shipped as a Docker image and a Helm chart.";

// Sites that show a link's preview need absolute URLs. The Pages workflow passes the site's
// address, base path included (https://sajanv88.github.io/authserver-oidc).
const siteUrl = process.env.SITE_URL ?? "http://localhost:3002";
const ogImage = {
  url: OG_IMAGE.path,
  width: OG_IMAGE.width,
  height: OG_IMAGE.height,
  alt: OG_IMAGE.alt,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `${PRODUCT_NAME}: self-hosted OpenID Connect for your apps`,
  description,
  openGraph: {
    title: `${PRODUCT_NAME}: the identity server you run yourself`,
    description,
    type: "website",
    siteName: PRODUCT_NAME,
    images: [ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${PRODUCT_NAME}: the identity server you run yourself`,
    description,
    images: [ogImage],
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The stored appearance is put on <html> before React hydrates, hence the warning's off.
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant written in this repo, not input. */}
        <script dangerouslySetInnerHTML={{ __html: APPLY_STORED_APPEARANCE }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
