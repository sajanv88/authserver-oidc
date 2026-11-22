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
import { PRODUCT_NAME } from "@/content/site";

const description =
  "A self-hosted OpenID Connect server for your own apps: sign-in, two-factor, consent and an admin for clients, on Next.js 16 and Better Auth, shipped as a Docker image and a Helm chart.";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME}: self-hosted OpenID Connect for your apps`,
  description,
  openGraph: {
    title: `${PRODUCT_NAME}: one sign-in for every app you ship`,
    description,
    type: "website",
    siteName: PRODUCT_NAME,
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
