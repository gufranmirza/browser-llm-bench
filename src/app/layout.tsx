import "@fontsource-variable/dm-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { AppProvider } from "../components/layout/AppProvider";
import { Footer } from "../components/layout/Footer";
import { Header } from "../components/layout/Header";
import "../styles/base.css";
import "../styles/components.css";
import "../styles/charts.css";
export const metadata: Metadata = {
  title: {
    default: "Browser Inference Bench — Browser inference, measured.",
    template: "%s · Browser Inference Bench",
  },
  description:
    "Measured browser LLM performance and resource footprints. Compare saved benchmarks or run a private test on your device.",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
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
