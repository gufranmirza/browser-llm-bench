import type { Metadata } from "next";
import { brand } from "./brand";

/** The deployment root, including any repository subpath, is set at build time. */
export const siteUrl = new URL(
  (process.env.NEXT_PUBLIC_SITE_URL || "https://browserllm.dev").replace(
    /\/$/,
    "",
  ) + "/",
);
if (
  !/^https?:$/.test(siteUrl.protocol) ||
  siteUrl.search ||
  siteUrl.hash ||
  siteUrl.username ||
  siteUrl.password
) {
  throw Error(
    "NEXT_PUBLIC_SITE_URL must be an HTTP(S) deployment root without credentials, a query or a fragment.",
  );
}
export function publicUrl(path = "") {
  return new URL(path.replace(/^\//, ""), siteUrl).href;
}
export function pageMetadata({
  title,
  description = brand.description,
  path = "/",
  index = true,
  image = "brand/social-card.png",
}: {
  title?: string;
  description?: string;
  path?: string;
  index?: boolean;
  image?: string;
} = {}): Metadata {
  const fullTitle = title ? `${title} · ${brand.name}` : brand.title;
  const imageAlt = title
    ? `${title} — ${brand.name}`
    : "Browser LLM Bench — browser LLM speed, latency and resource benchmarks";
  return {
    title: { absolute: fullTitle },
    description,
    alternates: {
      canonical: publicUrl(path),
      ...(index
        ? {
            types: {
              "text/markdown": publicUrl(
                `seo/guides/${path === "/" ? "index" : path.replace(/^\/|\/$/g, "")}.md`,
              ),
            },
          }
        : {}),
    },
    robots: {
      index,
      follow: index,
      googleBot: {
        index,
        follow: index,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      siteName: brand.name,
      title: fullTitle,
      description,
      url: publicUrl(path),
      locale: "en_US",
      images: [
        {
          url: publicUrl(image),
          width: 1200,
          height: 630,
          alt: imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [{ url: publicUrl(image), alt: imageAlt }],
    },
  };
}
