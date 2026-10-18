import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseReports } from "../src/benchmark/schemas/report";
const directory = resolve("public/reports");
const manifest = JSON.parse(
  await readFile(resolve(directory, "manifest.json"), "utf8"),
);
if (manifest.version !== 1 || !Array.isArray(manifest.reports))
  throw Error("Invalid manifest");
const ids = new Set<string>();
for (const entry of manifest.reports) {
  if (!/^[a-f0-9-]{36}\.json$/.test(entry.file))
    throw Error("Unsafe report filename");
  const [report] = parseReports(
    JSON.parse(await readFile(resolve(directory, entry.file), "utf8")),
  );
  if (
    report.id !== entry.id ||
    report.model !== entry.model ||
    ids.has(report.id)
  )
    throw Error("Manifest/report mismatch");
  ids.add(report.id);
}
console.log(
  `Validated ${ids.size} published reports against the shared schema.`,
);
