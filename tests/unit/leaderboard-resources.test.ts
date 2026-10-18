import assert from "node:assert/strict";
import test from "node:test";
import {
  comparisonKey,
  intervalAverage,
  summarizeResources,
} from "../../src/benchmark/metrics/resources";
import type { Report } from "../../src/benchmark/schemas/report";
import type { Row } from "../../src/features/leaderboard/data";

test("resource averages exclude idle, boundary crossings, gaps and overlapping intervals", () => {
  const result = intervalAverage(
    [
      { start: -100, end: 100, value: 900 },
      { start: 0, end: 1000, value: 10 },
      { start: 1000, end: 3000, value: 40 },
      { start: 2000, end: 3000, value: 900 },
      { start: 3000, end: 4000, value: null },
      { start: 4000, end: 5000, value: 900 },
      { start: 5000, end: 6000, value: 0 },
    ],
    [
      { startMs: 0, endMs: 4000 },
      { startMs: 5000, endMs: 6000 },
    ],
  );
  assert.equal(result.value, 22.5);
  assert.equal(result.coverage, 0.8);
  const overlap = intervalAverage(
    [
      { start: 0, end: 1000, value: 10 },
      { start: 999, end: 2000, value: 20 },
    ],
    [{ startMs: 0, endMs: 2000 }],
  );
  assert.equal(overlap.value, 15);
  assert.equal(overlap.coverage, 1);
  assert.deepEqual(
    intervalAverage(
      [{ start: 0, end: 1000, value: null }],
      [{ startMs: 0, endMs: 1000 }],
    ),
    { value: null, coverage: 0 },
  );
});

test("memory summaries use full-run peak, final loaded idle and after unload separately", () => {
  const report = {
    profile: {
      totalMs: 10000,
      events: [
        { type: "phase", phase: "baseline", tMs: 0 },
        { type: "phase", phase: "active", tMs: 1000 },
        { type: "phase", phase: "idle", tMs: 3000 },
        { type: "phase", phase: "active", tMs: 5000 },
        { type: "phase", phase: "idle", tMs: 7000 },
        { type: "phase", phase: "unload", tMs: 9000 },
        { type: "phase", phase: "recovery", tMs: 9500 },
      ],
    },
    nativeTrace: {
      logicalCpus: 2,
      points: [
        [-1, 100],
        [0, 1],
        [2000, 8],
        [4000, 7],
        [6000, 9],
        [7500, 5],
        [8500, 3],
        [9800, 2],
        [10001, 99],
      ].map(([tMs, gb]) => ({
        tMs,
        footprintBytes: gb * 1e9,
        cpuOneCorePercent: null,
        incompleteCpuIntervals: 0,
      })),
      power: [],
    },
  } as unknown as Report;
  const r = summarizeResources(report);
  assert.equal(r.peakMemory, 9);
  assert.equal(r.idleMemory, 4);
  assert.equal(r.releasedMemory, 2);
  assert.equal(r.cpu, null);
  assert.equal(r.gpuTime, null);
  assert.equal(r.power, null);
  assert.equal(summarizeResources().peakMemory, null);
});

test("comparison setups separate pacing, hardware and output settings", () => {
  const row = {
    device: "machine A",
    browser: "Chrome 155",
    runtime: "WebLLM",
    cache: "absent",
    protocol: "v2",
    workload: "repeat",
    report: {
      environment: { hardwareConcurrency: 18, adapter: "Metal" },
      profile: { plan: { requestGapMs: 0 } },
      settings: { maxTokens: 64 },
      samples: [{ warmup: false, prompt: "test" }],
    },
  } as unknown as Row;
  for (const mutate of [
    (r: Row) => {
      r.device = "machine B";
    },
    (r: Row) => {
      r.report!.settings.maxTokens = 128;
    },
    (r: Row) => {
      (
        r.report!.profile!.plan as unknown as { requestGapMs: number }
      ).requestGapMs = 4000;
    },
  ]) {
    const changed = structuredClone(row);
    mutate(changed);
    assert.notEqual(comparisonKey(row), comparisonKey(changed));
  }
});
