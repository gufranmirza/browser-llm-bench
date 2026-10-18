import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cache } from "react";
import type { Report } from "../benchmark/schemas/report";
import { parseReports } from "../benchmark/schemas/report";

/** Build-time only: raw report bodies never become client component props. */
export const readPublishedReports = cache(async (): Promise<Report[]> => {
  const directory = resolve("public/reports");
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  return (
    await Promise.all(
      manifest.reports.map(async ({ file }: { file: string }) => {
        if (!/^[a-f0-9-]+\.json$/.test(file))
          throw Error("Invalid published report file");
        return parseReports(
          JSON.parse(await readFile(resolve(directory, file), "utf8")),
        );
      }),
    )
  ).flat();
});
