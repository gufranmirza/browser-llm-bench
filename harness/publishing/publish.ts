/** Explicit promotion of an audited 60-request report. No collector writes public data. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseReports } from "../../src/benchmark/schemas/report";
export function publicationReport(value: unknown) {
  const [report] = parseReports(value);
  if (
    report.status !== "complete" ||
    !report.profile?.plan.countSchedule ||
    report.samples.filter((s) => !s.warmup && s.valid).length !== 60
  )
    throw Error(
      "Publication requires a complete, validated 3 × 20 comparison report",
    );
  if (!/^[a-f0-9-]{36}$/.test(report.id))
    throw Error("Publication requires a UUID report ID");
  return report;
}
function sanitized(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(/\/Users\/[^/\s\"']+/g, "<user-home>");
  if (Array.isArray(value)) return value.map(sanitized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, sanitized(v)]),
    );
  return value;
}
export async function publish(
  file: string,
  { directory = "public/reports", dryRun = false } = {},
) {
  const bytes = await readFile(resolve(file));
  const report = publicationReport(JSON.parse(bytes.toString()));
  const compact = sanitized(report) as typeof report;
  const name = report.id + ".json";
  const target = resolve(directory);
  const manifest = JSON.parse(
    await readFile(resolve(target, "manifest.json"), "utf8"),
  );
  const audit = {
    id: report.id,
    model: report.model,
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    native: !!report.nativeTrace,
    dryRun,
  };
  if (dryRun) return audit;
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, name), JSON.stringify(compact) + "\n");
  manifest.reports = [
    ...manifest.reports.filter(
      (r: { model: string }) => r.model !== report.model,
    ),
    {
      id: report.id,
      model: report.model,
      file: name,
      createdAt: report.createdAt,
    },
  ];
  const temp = resolve(target, "manifest.tmp");
  await writeFile(temp, JSON.stringify(manifest, null, 2) + "\n");
  await rename(temp, resolve(target, "manifest.json"));
  await mkdir(resolve("artifacts/publication-audits"), { recursive: true });
  await writeFile(
    resolve("artifacts/publication-audits", report.id + ".json"),
    JSON.stringify(audit, null, 2) + "\n",
  );
  return audit;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const file = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (!file)
    throw Error(
      "Usage: npm run harness:publish -- artifacts/runs/.../combined-report.json [--dry-run]",
    );
  console.log(
    await publish(file, { dryRun: process.argv.includes("--dry-run") }),
  );
}
