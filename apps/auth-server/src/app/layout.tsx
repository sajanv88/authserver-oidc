import "@nuvui/react/styles.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/barcodes/styles.css";
import "@nuvui/table/styles.css";
import "@/shared/styles/globals.scss";

import { Toaster } from "@nuvui/react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { htmlAttributes } from "@/shared/appearance/appearance";
import { readAppearance } from "@/shared/appearance/read-appearance";
import { APP_NAME } from "@/shared/config/app";
import { env } from "@/shared/config/env";
import { NonceProvider } from "@/shared/ui/nonce-provider/nonce-provider";
import { TurnstileProvider } from "@/shared/ui/turnstile/turnstile";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  robots: { index: false, follow: false },
};

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  const appearance = await readAppearance();

  return (
    <html lang="en" {...htmlAttributes(appearance)}>
      <body>
        <NonceProvider nonce={nonce}>
          <TurnstileProvider siteKey={env().turnstile?.siteKey}>
            {children}
            <Toaster />
          </TurnstileProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
