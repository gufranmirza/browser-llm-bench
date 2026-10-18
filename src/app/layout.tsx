import localFont from "next/font/local";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import type { Metadata } from "next";
import { brand } from "../lib/brand";
import { pageMetadata, siteUrl } from "../lib/metadata";
import { assetUrl } from "../lib/urls";
import { Suspense, type ReactNode } from "react";
import { AppProvider } from "../components/layout/AppProvider";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";
import { Analytics } from "../components/layout/Analytics";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/charts.css";
import "../features/leaderboard/leaderboard.css";
import "../features/model-report/model-report.css";
import "../features/runner/runner.css";
import "../features/capabilities/capabilities.css";
const sans = localFont({
  src: "../assets/fonts/dm-sans-latin-variable.woff2",
  variable: "--font-brand-sans",
  display: "swap",
  preload: true,
  fallback: ["Arial"],
  adjustFontFallback: "Arial",
});
export const metadata: Metadata = {
  ...pageMetadata(),
  // Route-level canonicals belong to pages, never inherited from the layout.
  alternates: undefined,
  metadataBase: siteUrl,
  applicationName: brand.name,
  icons: {
    icon: [
      {
        url: assetUrl("favicon.ico"),
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      { url: assetUrl("favicon.svg"), type: "image/svg+xml" },
    ],
    shortcut: assetUrl("favicon.ico"),
    apple: {
      url: assetUrl("apple-touch-icon.png"),
      sizes: "180x180",
      type: "image/png",
    },
  },
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <head>
        <link rel="describedby" href={assetUrl("llms.txt")} type="text/plain" />
      </head>
      <body>
        <Analytics />
        <div id="root">
          <AppProvider>
            <Header />
            <main>
              <Suspense fallback={<p role="status">Loading…</p>}>
                {children}
              </Suspense>
            </main>
            <Footer />
          </AppProvider>
        </div>
      </body>
    </html>
  );
}
