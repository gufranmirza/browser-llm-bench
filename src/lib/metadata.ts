import type { Metadata } from "next";
import { brand } from "./brand";

/** The deployment root, including any repository subpath, is set at build time. */
export const siteUrl = new URL(
  (
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://gufranmirza.github.io/browser-llm-bench"
  ).replace(/\/$/, "") + "/",
);
export function publicUrl(path = "") {
  return new URL(path.replace(/^\//, ""), siteUrl).href;
}
export function pageMetadata({
  title,
  description = brand.description,
  path = "/",
  index = true,
}: {
  title?: string;
  description?: string;
  path?: string;
  index?: boolean;
} = {}): Metadata {
  const fullTitle = title ? `${title} · ${brand.name}` : brand.title;
  return {
    title: { absolute: fullTitle },
    description,
    alternates: { canonical: publicUrl(path) },
    robots: { index, follow: index },
    openGraph: {
      type: "website",
      siteName: brand.name,
      title: fullTitle,
      description,
      url: publicUrl(path),
      locale: "en_US",
      images: [
        {
          url: publicUrl("brand/social-card.png"),
          width: 1200,
          height: 630,
          alt: "Browser LLM Bench — browser LLM speed, latency and resource benchmarks",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [publicUrl("brand/social-card.png")],
    },
  };
}
