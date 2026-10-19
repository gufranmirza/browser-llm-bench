import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import live from "../../src/benchmark/runtime/catalog";
import { parseReports } from "../../src/benchmark/schemas/report";
import { fixtureRows } from "../fixtures/synthetic-rows";
import {
  comparisonGroups,
  selectComparison,
} from "../../src/features/leaderboard/comparison";

import type { Report } from "../../src/benchmark/schemas/report";
import {
  artifacts,
  browserLabel,
  defaultFilters,
  filterRows,
  inOneCohort,
  measuredFilters,
  precision,
  primaryMeasuredRows,
  primaryReportFor,
  reportRow,
  sortRows,
} from "../../src/features/leaderboard/data";
const report = parseReports(
  JSON.parse(
    readFileSync(
      new URL("../../tests/fixtures/legacy-repeat.json", import.meta.url),
      "utf8",
    ),
  ),
)[0];
test("catalog offers unique verified encodings and every pinned runnable artifact", () => {
  assert.ok(artifacts.length >= live.models.length);
  assert.equal(
    new Set(artifacts.map((a) => a.model_id)).size,
    artifacts.length,
  );
  assert.deepEqual([...new Set(artifacts.map((a) => a.encoding))].sort(), [
    "q0f16",
    "q0f32",
    "q4f16_1",
    "q4f32_1",
  ]);
  assert.equal(artifacts.filter((a) => a.runnable).length, live.models.length);
  assert.match(precision.q0f16, /Unquantized FP16/);
  assert.ok(artifacts.every((a) => a.model && a.url && a.model_lib));
});
test("measured rows preserve missing telemetry and exclude warmup from medians", () => {
  const row = reportRow(report);
  assert.equal(row.samples.length, 3);
  assert.deepEqual(row.inputTokens, [43, 43, 43]);
  assert.deepEqual(row.outputTokens, [63, 63, 63]);
  assert.equal(row.payloadBytes, null);
  assert.equal(row.initMs, null);
  const measured = report.samples
    .filter((s) => !s.warmup)
    .map((s) => s.decodeTokensPerSecond!)
    .sort((a, b) => a - b);
  assert.equal(row.decode, measured[1]);
  assert.equal(row.testedInput, 43);
});
test("context sweeps and failed attempts cannot enter aggregate performance ordering", () => {
  for (const change of [
    { workload: "context" },
    { status: "failed" as const },
  ]) {
    const row = reportRow({ ...report, ...change });
    assert.equal(row.decode, null);
    assert.equal(row.firstOutputMs, null);
    assert.equal(row.responseMs, null);
    assert.equal(row.samples.length, 3);
  }
});
test("reports from apparently identical devices are never silently pooled", () => {
  const rows = [
    reportRow(report),
    reportRow({ ...report, id: "different-run" }),
  ];
  const selected = inOneCohort(rows, rows[1].cohort);
  assert.equal(selected.rows.length, 1);
  assert.equal(selected.rows[0].report?.id, "different-run");
  assert.equal(selected.cohorts.length, 2);
});
test("comparison selection preserves runtime boundaries and survives group reordering", () => {
  const rows = [
    reportRow(report),
    reportRow({ ...report, id: "new-runtime", runtime: "WebLLM 0.2.86" }),
    reportRow({
      ...report,
      id: "another-device",
      environment: { ...report.environment, deviceLabel: "Another device" },
    }),
  ];
  const groups = comparisonGroups(rows);
  assert.equal(groups.length, 3);
  for (const row of rows) {
    const id = row.report!.id;
    assert.deepEqual(selectComparison(groups, id)?.rows, [row]);
    assert.deepEqual(selectComparison([...groups].reverse(), id)?.rows, [row]);
  }
  assert.equal(selectComparison(groups, "unknown"), groups[0]);
  assert.equal(selectComparison([], "unknown"), undefined);
});
test("every published report is reachable through its comparison group", () => {
  const directory = new URL("../../public/reports/", import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("manifest.json", directory), "utf8"),
  );
  const rows = manifest.reports.flatMap(({ file }: { file: string }) =>
    parseReports(
      JSON.parse(readFileSync(new URL(file, directory), "utf8")),
    ).map(reportRow),
  ) as ReturnType<typeof reportRow>[];
  const groups = comparisonGroups(rows);
  for (const row of rows) {
    const selected = selectComparison(groups, row.report!.id)!;
    assert.ok(selected.rows.includes(row));
    assert.ok(
      selected.rows.every((candidate) => candidate.runtime === row.runtime),
    );
  }
});
const fixtureFilters = {
  ...defaultFilters,
  source: "illustrative" as const,
  device: "MacBook Air · M2 · 16 GB",
  browser: "Chrome 138",
  runtime: "WebLLM 0.2.82",
  workload: "short",
  cache: "absent",
};
test("source, exact encoding, untested, parameter and cohort filters remain independent", () => {
  assert.equal(filterRows(fixtureRows, fixtureFilters).length, 6);
  assert.equal(
    filterRows(fixtureRows, { ...fixtureFilters, source: "measured" }).length,
    0,
  );
  assert.equal(
    filterRows(fixtureRows, { ...fixtureFilters, quant: "q0f32" }).length,
    0,
  );
  const untested = filterRows(fixtureRows, {
    ...fixtureFilters,
    quant: "q0f32",
    untested: true,
  });
  assert.equal(untested.length, 1);
  assert.equal(untested[0].decode, null);
  assert.equal(
    filterRows(fixtureRows, { ...fixtureFilters, size: "tiny" }).length,
    2,
  );
  assert.equal(
    new Set(inOneCohort(fixtureRows, "").rows.map((r) => r.cohort)).size,
    1,
  );
});
test("unavailable values stay last in both sort directions", () => {
  const row = reportRow(report);
  for (const descending of [true, false]) {
    const sorted = sortRows(
      [
        { ...row, id: "null", decode: null },
        { ...row, id: "low", decode: 1 },
        { ...row, id: "high", decode: 3 },
      ],
      "decode",
      descending,
    );
    assert.equal(sorted.at(-1)?.id, "null");
    assert.equal(sorted[0].id, descending ? "high" : "low");
  }
});
test("Edge user agents retain their actual browser identity", () => {
  assert.equal(
    browserLabel("Mozilla/5.0 Chrome/138.0.0.0 Safari/537.36 Edg/138.0.3351.0"),
    "Edge 138.0.3351.0",
  );
});

test("normal browsing defaults to measured evidence and clears old fixture filters", () => {
  assert.equal(defaultFilters.source, "measured");
  assert.deepEqual(
    measuredFilters(
      new URLSearchParams(
        "source=illustrative&device=Fake&browser=Chrome+138&cache=absent&cohort=fixture:0&quant=q4f16_1&untested=true",
      ),
    ),
    defaultFilters,
  );
  const f = measuredFilters(
    new URLSearchParams(
      "source=measured&browser=Chrome+150&untested=true&cohort=run:old",
    ),
  );
  assert.equal(f.browser, "Chrome 150");
  assert.equal(f.untested, false);
  assert.equal(f.cohort, "");
});
test("main browsing selects one real report per artifact and retains failed-only evidence", () => {
  const older = { ...report, id: "older", createdAt: "2026-10-16T12:00:00Z" };
  const newer = { ...report, id: "newer", createdAt: "2026-10-17T12:00:00Z" };
  const failed = {
    ...report,
    id: "failed",
    status: "failed" as const,
    createdAt: "2026-10-17T13:00:00Z",
  };
  const selected = primaryMeasuredRows([
    ...fixtureRows,
    reportRow(older),
    reportRow(newer),
    reportRow(failed),
  ]);
  assert.equal(selected.length, 1);
  assert.equal(selected[0].report?.id, "newer");
  assert.equal(primaryMeasuredRows([reportRow(failed)])[0].status, "failed");
  assert.equal(primaryMeasuredRows([reportRow(failed)])[0].decode, null);
  assert.equal(primaryMeasuredRows(fixtureRows).length, 0);
});

test("a Metal diagnostic remains inspectable but does not replace the ordinary performance baseline", () => {
  const diagnostic = {
    ...report,
    id: "metal-diagnostic",
    createdAt: "2026-10-18T12:00:00Z",
    nativeTrace: {
      gpuValidation: { source: "Metal System Trace" },
    } as Report["nativeTrace"],
  };
  assert.equal(
    primaryReportFor([report, diagnostic], report.model)?.id,
    report.id,
  );
  assert.equal(primaryReportFor([diagnostic], report.model)?.id, diagnostic.id);
  assert.equal(reportRow(diagnostic).report?.id, diagnostic.id);
});
