import type { MetadataRoute } from "next";
import { catalog } from "../features/leaderboard/data";
import { publicUrl } from "../lib/metadata";
export const dynamic = "force-static";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    "/",
    "/methodology/",
    "/compatibility/",
    "/run/",
    ...catalog.map((model) => `/models/${model.slug}/`),
  ].map((path) => ({ url: publicUrl(path) }));
}
