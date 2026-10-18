import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicationReport } from "../../harness/publishing/publish";
const sample = JSON.parse(
  readFileSync("tests/fixtures/profile-repeat.json", "utf8"),
);
test("publishing rejects short diagnostics and incomplete captures", () => {
  assert.throws(() => publicationReport(sample), /3 × 20/);
  assert.throws(
    () => publicationReport({ ...sample, status: "failed" }),
    /3 × 20/,
  );
});
test("curated complete count sessions meet the explicit publication gate", () => {
  const manifest = JSON.parse(
    readFileSync("public/reports/manifest.json", "utf8"),
  );
  const reports = manifest.reports.map((r: { file: string }) =>
    JSON.parse(readFileSync("public/reports/" + r.file, "utf8")),
  );
  for (const report of reports.filter(
    (r: any) => r.profile?.plan.countSchedule,
  ))
    assert.equal(
      publicationReport(report).samples.filter((s) => !s.warmup).length,
      60,
    );
});
