import { parseReports } from "../benchmark/schemas/report";
import { assetUrl } from "./urls";

import type { Report } from "../benchmark/schemas/report";
export async function loadRepositoryReports(): Promise<Report[]> {
  const base = assetUrl("/reports/");
  const response = await fetch(base + "manifest.json", { cache: "no-cache" });
  if (response.status === 404) return [];
  if (!response.ok) throw Error("Could not load repository report manifest");
  const manifest = await response.json();
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.reports) ||
    manifest.reports.length > 100
  )
    throw Error("Invalid repository report manifest");
  return (
    await Promise.all(
      manifest.reports.map(async (entry: { file: string }) => {
        if (!/^[a-f0-9-]+\.json$/.test(entry.file))
          throw Error("Invalid report file");
        const r = await fetch(base + entry.file);
        if (!r.ok) throw Error("Could not load published report");
        return parseReports(await r.json());
      }),
    )
  ).flat();
}
