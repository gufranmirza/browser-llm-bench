import assert from "node:assert/strict";
import test from "node:test";
import {
  observedPeak,
  resourceSeries,
  resourceWindow,
} from "../../src/benchmark/metrics/resource-series";
import { nativeTraceSchema } from "../../src/benchmark/schemas/native";
import type { Report } from "../../src/benchmark/schemas/report";
const report = {
  profile: {
    totalMs: 5000,
    points: [
      { tMs: 0, scope: "main", heapBytes: 1e6, eventLoopDelayMs: 1 },
      {
        tMs: 2000,
        scope: "worker",
        wasmBytes: 2e6,
        gpuBufferBytes: 3e6,
        heapBytes: null,
        eventLoopDelayMs: 4,
      },
      {
        tMs: 5100,
        scope: "worker",
        wasmBytes: 999e6,
        gpuBufferBytes: 999e6,
        heapBytes: null,
        eventLoopDelayMs: 999,
      },
    ],
    events: [
      { type: "phase", phase: "baseline", tMs: 0 },
      { type: "phase", phase: "active", tMs: 1500 },
      { type: "phase", phase: "idle", tMs: 4000 },
      { type: "phase", phase: "finished", tMs: 5100 },
    ],
  },
  nativeTrace: {
    logicalCpus: 4,
    points: [-100, 1000, 2000, 3000, 4000, 5100].map((tMs) => ({
      tMs,
      cpuOneCorePercent: 200,
      footprintBytes: 10e6,
      hostGpuUtilizationPercent: 50,
    })),
    power: [1000, 2000, 3000, 5100].map((tMs) => ({
      tMs,
      intervalMs: 1000,
      cpuWatts: 10,
      gpuWatts: 5,
      aneWatts: 0,
    })),
  },
} as unknown as Report;
test("V2 full-run series exclude pre-run, post-stop and late worker data without changing source", () => {
  const before = JSON.stringify(report);
  const s = resourceSeries(report);
  assert.deepEqual(
    s.processes.map((p) => p.time),
    [1, 2, 3, 4],
  );
  assert.equal(s.processes[0].cpu, null);
  assert.equal(s.processes[1].cpu, 50);
  assert.equal(s.worker.length, 1);
  assert.equal(s.worker[0].buffers, 3);
  assert.equal(JSON.stringify(report), before);
});
test("V2 phase focus shares exact bounds and omits CPU/power intervals crossing selected start", () => {
  const s = resourceSeries(report, "active");
  assert.equal(s.window.startMs, 1500);
  assert.equal(s.window.endMs, 4000);
  assert.deepEqual(
    s.processes.map((p) => p.time),
    [2, 3, 4],
  );
  assert.equal(s.processes[0].cpu, null);
  assert.equal(s.processes[1].cpu, 50);
  assert.equal(s.power[0].cpu, null);
  assert.equal(s.power[1].cpu, 10);
  assert.equal(s.processes[0].footprint, 10);
});
test("V2 missing measurements remain unavailable, and unknown phases use full run", () => {
  assert.equal(observedPeak([{ value: null }], "value"), null);
  assert.equal(observedPeak([{ value: 0 }, { value: null }], "value"), 0);
  assert.equal(resourceWindow(report, "missing").endMs, 5000);
  assert.equal(resourceWindow(report, "missing").startMs, 0);
});

test("resource stages retain the full usage window and repeated intervals can be selected individually", () => {
  const repeated = structuredClone(report);
  repeated.profile!.events = [
    { type: "phase", phase: "baseline", tMs: 0, label: "baseline" },
    { type: "phase", phase: "active", tMs: 1000, label: "first" },
    { type: "phase", phase: "idle", tMs: 2000, label: "pause" },
    { type: "phase", phase: "active", tMs: 3000, label: "second" },
    { type: "phase", phase: "unload", tMs: 4000, label: "unload" },
  ];
  const use = resourceWindow(repeated, "use");
  assert.equal(use.startMs, 1000);
  assert.equal(use.endMs, 4000);
  const second = resourceWindow(repeated, "interval:3");
  assert.equal(second.startMs, 3000);
  assert.equal(second.endMs, 4000);
});

test("Chrome GPU intervals retain gaps, measured zeros and uncapped time, and respect selected boundaries", () => {
  const captured = structuredClone(report);
  captured.nativeTrace!.gpu = [
    { startMs: -500, tMs: 500, intervalMs: 1000, gpuTimeMs: 20 },
    { startMs: 1000, tMs: 2000, intervalMs: 1000, gpuTimeMs: 20 },
    { startMs: 2000, tMs: 3000, intervalMs: 1000, gpuTimeMs: null },
    { startMs: 3000, tMs: 3500, intervalMs: 500, gpuTimeMs: 0 },
    { startMs: 3500, tMs: 4000, intervalMs: 500, gpuTimeMs: 1000 },
    { startMs: 4500, tMs: 5500, intervalMs: 1000, gpuTimeMs: 999 },
  ].map((p) => ({
    ...p,
    epochMs: p.tMs + 100000,
    clientCount: 1,
    collectionCostMs: 1,
    issues: p.gpuTimeMs === null ? ["counter reset"] : [],
  }));
  assert.deepEqual(
    resourceSeries(captured).browserGpu.map((p) => p.gpuTime),
    [null, 20, null, 0, 2000],
  );
  assert.deepEqual(
    resourceSeries(captured, "active").browserGpu.map((p) => p.gpuTime),
    [null, null, 0, 2000],
  );
  assert.deepEqual(resourceSeries(report).browserGpu, []);
});

test("native schema preserves optional GPU evidence and rejects values across discontinuities", () => {
  const base = {
    version: "macos-native-trace-v1",
    rootPid: 10,
    logicalCpus: 4,
    startedEpochMs: 1000,
    endedEpochMs: 5000,
    clockAlignment: {
      method: "test",
      browserOffsetMs: 0,
      maxNativeWallClockDriftMs: 0,
      notes: "test",
    },
    coverage: [],
    points: [],
    power: [],
    energy: {
      scope: "test",
      baselinePowerWatts: null,
      activeEnergyJoules: null,
      coveredActiveMs: 0,
      activeAboveBaselineJoules: null,
      note: "test",
    },
    provenance: {},
    rawSamples: [],
    rawPower: [],
    processes: [],
    processEvents: [],
  };
  const gpu = [
    {
      startMs: 0,
      tMs: 1000,
      epochMs: 2000,
      intervalMs: 1000,
      gpuTimeMs: 0,
      clientCount: 1,
      collectionCostMs: 1,
      issues: [],
    },
  ];
  assert.equal(nativeTraceSchema.parse(base).gpu, undefined);
  assert.deepEqual(nativeTraceSchema.parse({ ...base, gpu }).gpu, gpu);
  for (const change of [
    { startMs: 1000 },
    { intervalMs: null },
    { gpuTimeMs: -1 },
    { issues: ["reset"] },
  ])
    assert.equal(
      nativeTraceSchema.safeParse({ ...base, gpu: [{ ...gpu[0], ...change }] })
        .success,
      false,
    );
});
