import type { MetadataRoute } from "next";
import { publicUrl } from "../lib/metadata";
export const dynamic = "force-static";
export default function robots(): MetadataRoute.Robots {
  // Private pages use noindex metadata; let crawlers read that directive.
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/__harness/" },
    sitemap: publicUrl("sitemap.xml"),
  };
}
