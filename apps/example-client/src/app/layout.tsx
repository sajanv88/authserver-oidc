import "@nuvui/react/styles.css";
import "@nuvui/table/styles.css";
import "@/shared/styles/globals.scss";

import type { Metadata } from "next";
import { APP_NAME } from "@/shared/config/app";
import { SiteHeader } from "@/shared/ui/site-header/site-header";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  robots: { index: false, follow: false },
};

// Every response carries a fresh CSP nonce (proxy.ts), and every page reads cookies.
export const instant = false;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="system" data-density="default">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
