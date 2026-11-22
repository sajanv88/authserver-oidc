import "@nuvui/react/styles.css";
import "@nuvui/barcodes/styles.css";
import "@nuvui/table/styles.css";
import "@/shared/styles/globals.scss";

import { Toaster } from "@nuvui/react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { APP_NAME } from "@/shared/config/app";
import { env } from "@/shared/config/env";
import { NonceProvider } from "@/shared/ui/nonce-provider/nonce-provider";
import { TurnstileProvider } from "@/shared/ui/turnstile/turnstile";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  // Sign-in and consent pages have no business in search results.
  robots: { index: false, follow: false },
};

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell. Data caching with "use cache" still works.
export const instant = false;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? "";

  return (
    <html lang="en" data-theme="system" data-density="default">
      <body>
        <NonceProvider nonce={nonce}>
          {/* The public site key, only when Turnstile is configured (TURNSTILE_* in env). */}
          <TurnstileProvider siteKey={env().turnstile?.siteKey}>
            {children}
            {/* Once, for every toast() in the app. */}
            <Toaster />
          </TurnstileProvider>
        </NonceProvider>
      </body>
    </html>
  );
}
