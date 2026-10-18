import assert from "node:assert/strict";
import test from "node:test";
import {
  distribution,
  percentile,
  performanceRows,
} from "../../src/benchmark/metrics/performance";
import type { Sample } from "../../src/benchmark/schemas/report";
const sample = (overrides: Partial<Sample> = {}): Sample => ({
  prompt: "test",
  output: "text",
  valid: true,
  warmup: false,
  inputTokens: 4,
  outputTokens: 10,
  firstOutputMs: 20,
  responseMs: 100,
  decodeTokensPerSecond: 120,
  finishReason: "stop",
  ...overrides,
});
test("performance excludes warmup and invalid values without closing request gaps or changing source", () => {
  const samples = [
    sample({ warmup: true }),
    sample(),
    sample({ valid: false }),
    sample({ firstOutputMs: null, decodeTokensPerSecond: null }),
  ];
  const before = JSON.stringify(samples);
  const rows = performanceRows(samples);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.request),
    [1, 2, 3],
  );
  assert.equal(rows[1].duration, null);
  assert.equal(rows[2].latency, null);
  assert.equal(rows[2].duration, 0.1);
  assert.equal(JSON.stringify(samples), before);
});
test("breakdown uses paired timings in seconds and never invents negative or missing components", () => {
  const rows = performanceRows([
    sample(),
    sample({ firstOutputMs: 101 }),
    sample({ firstOutputMs: null }),
    sample({ firstOutputMs: 0 }),
  ]);
  assert.equal(rows[0].wait, 0.02);
  assert.equal(rows[0].remaining, 0.08);
  assert.equal(rows[0].wait! + rows[0].remaining!, rows[0].duration);
  assert.equal(rows[1].wait, null);
  assert.equal(rows[1].remaining, null);
  assert.equal(rows[2].remaining, null);
  assert.equal(rows[3].wait, 0);
});
test("histograms account for every observation including the maximum, constant and empty series", () => {
  const values = [0, 0, 1, 2, 3, 4, 4, 5, 10];
  const bins = distribution(values);
  assert.equal(
    bins.reduce((sum, b) => sum + b.count, 0),
    values.length,
  );
  assert.equal(bins.at(-1)?.upper, 10);
  assert.equal(bins.at(-1)?.count, 1);
  assert.deepEqual(distribution([0, 0]), [{ lower: 0, upper: 0, count: 2 }]);
  assert.deepEqual(distribution([]), []);
  assert.equal(percentile([], 0.5), null);
  assert.equal(percentile([10, 0, 20, 30], 0.5), 15);
});
