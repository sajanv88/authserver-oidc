import "@nuvui/react/styles.css";
import "@nuvui/react/themes/ink.css";
import "@nuvui/react/themes/ledger.css";
import "@nuvui/react/themes/meadow.css";
import "@nuvui/react/themes/ember.css";
import "@nuvui/react/themes/high-contrast.css";
import "@nuvui/backgrounds/styles.css";
import "@nuvui/barcodes/styles.css";
import "@nuvui/table/styles.css";
import "@/shared/styles/globals.scss";

import { Toaster } from "@nuvui/react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { htmlAttributes } from "@/shared/appearance/appearance";
import { readAppearance } from "@/shared/appearance/read-appearance";
import { env } from "@/shared/config/env";
import { metricsExportEnabled } from "@/shared/telemetry/config";
import { WebVitalsReporter } from "@/shared/telemetry/web-vitals-reporter";
import { NonceProvider } from "@/shared/ui/nonce-provider/nonce-provider";
import { TurnstileProvider } from "@/shared/ui/turnstile/turnstile";

// The name is APP_NAME and the tab's icon LOGO_URL (else the shield in public/favicon.svg),
// read per request like everything else here (the layout already reads the request's
// headers), so a deployment can rebrand without a rebuild.
export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const { appName, logoUrl } = env();
  return {
    title: { default: appName, template: `%s · ${appName}` },
    icons: { icon: logoUrl ?? { url: "/favicon.svg", type: "image/svg+xml" } },
    robots: { index: false, follow: false },
  };
}

// Every response carries a fresh CSP nonce, so pages render per request instead of from a
// prerendered shell.
export const instant = false;

/**
 * Marks every route as rendered per request on purpose (Next 16's Cache Components rule), so
 * the metadata above may wait for the request: otherwise a page that reads nothing from it
 * would be reported as prerenderable with blocking metadata.
 */
async function RequestTime() {
  await connection();
  return null;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const nonce = (await headers()).get("x-nonce") ?? "";
  const appearance = await readAppearance();

  return (
    <html lang="en" {...htmlAttributes(appearance)}>
      <body>
        {/* Browsers report web vitals only when there's somewhere to send them. */}
        {metricsExportEnabled(process.env) && <WebVitalsReporter />}
        <NonceProvider nonce={nonce}>
          <TurnstileProvider siteKey={env().turnstile?.siteKey}>
            {children}
            <Toaster />
          </TurnstileProvider>
        </NonceProvider>
        <Suspense>
          <RequestTime />
        </Suspense>
      </body>
    </html>
  );
}
