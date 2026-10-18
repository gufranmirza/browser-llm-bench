"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { analyticsPage, analyticsReferrer } from "../../lib/analytics";

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "";
const enabled = /^G-[A-Z0-9]+$/.test(measurementId);

type AnalyticsWindow = Window & {
  [key: `ga-disable-${string}`]: boolean;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
};

export function Analytics() {
  const pathname = usePathname();
  const initialized = useRef(false);
  const lastPage = useRef<string | null>(null);
  const [loadTag, setLoadTag] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const page = analyticsPage(window.location.href);
    // Disable collection when navigating into private results or the runner.
    const target = window as unknown as AnalyticsWindow;
    target[`ga-disable-${measurementId}`] = !page;
    if (!page) {
      lastPage.current = null;
      return;
    }
    target.dataLayer ??= [];
    target.gtag ??= function () {
      target.dataLayer!.push(arguments);
    };
    const context = {
      page_location: page,
      page_referrer: analyticsReferrer(document.referrer),
      page_title: document.title,
    };
    if (!initialized.current) {
      target.gtag("js", new Date());
      target.gtag("config", measurementId, {
        ...context,
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      });
      initialized.current = true;
      setLoadTag(true);
    }
    if (lastPage.current === page) return;
    target.gtag("set", context);
    target.gtag("event", "page_view", { ...context, send_to: measurementId });
    lastPage.current = page;
  }, [pathname]);

  return loadTag ? (
    <Script
      id="google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  ) : null;
}
