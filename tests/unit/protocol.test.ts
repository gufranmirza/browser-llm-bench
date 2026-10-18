import assert from "node:assert/strict";
import test from "node:test";
import {
  makeProfile,
  recordPoint,
} from "../../src/benchmark/metrics/browser-profiler";
import {
  ACTIVE_MS,
  distribution,
  planFor,
  sessionWindow,
  shouldStartRequest,
} from "../../src/benchmark/protocol/schedule";
import { profileSchema } from "../../src/benchmark/schemas/profile";
import {
  parseReports,
  PROFILE_PROTOCOL,
} from "../../src/benchmark/schemas/report";

import { readFileSync } from "node:fs";
const legacy = JSON.parse(
  readFileSync("tests/fixtures/profile-repeat.json", "utf8"),
);
test("repeat presets and other workloads have explicit bounds", () => {
  assert.deepEqual(
    ["smoke", "standard", "extended", "timed"].map(
      (m) => planFor("repeat", m as any).measuredRequests,
    ),
    [3, 10, 100, 1000],
  );
  assert.equal(planFor("context").measuredRequests, 3);
  assert.equal(planFor("short").measuredRequests, 1);
  assert.equal(planFor("repeat", "timed").totalLimitMs, 900000);
  assert.equal(planFor("repeat", "timed").requestLimitMs, 60000);
});
test("timed run stops starting requests at exactly eight active minutes, excluding setup", () => {
  const p = planFor("repeat", "timed");
  assert.equal(shouldStartRequest(p, 400, ACTIVE_MS - 1), true);
  assert.equal(shouldStartRequest(p, 400, ACTIVE_MS), false);
  assert.equal(shouldStartRequest(p, 1000, 100), false);
  assert.equal(p.finishInFlight, true);
});
test("count mode stops at selected measured count", () => {
  const p = planFor("repeat");
  assert.equal(shouldStartRequest(p, 9, 480000), true);
  assert.equal(shouldStartRequest(p, 10, 100), false);
});
test("distribution ignores missing readings and preserves even medians", () => {
  assert.deepEqual(distribution([null, 2, 8, 4, 6]), {
    count: 4,
    min: 2,
    max: 8,
    median: 5,
  });
  assert.deepEqual(distribution([null]), {
    count: 0,
    min: null,
    max: null,
    median: null,
  });
});
test("legacy three-request reports roundtrip without invented profiling", () => {
  const r = parseReports(legacy)[0];
  assert.equal(r.profile, undefined);
  assert.equal(r.samples.filter((x) => !x.warmup).length, 3);
});
test("v2 partial cancellation preserves phase events and absent samples", () => {
  const profile = makeProfile(planFor("repeat"), true);
  profile.stopReason = "Stopped by user";
  profile.events = [
    { tMs: 100, type: "cancel", phase: "baseline", label: "Stopped by user" },
  ];
  profile.totalMs = 110;
  const r = {
    ...legacy,
    id: "cancel-test",
    schema: "browser-inference-bench-report-v2",
    protocol: PROFILE_PROTOCOL,
    status: "cancelled",
    samples: [],
    profile,
  };
  const parsed = parseReports(JSON.parse(JSON.stringify(r)))[0];
  assert.equal(parsed.profile?.unloadConfirmed, false);
  assert.equal(parsed.profile?.events[0].type, "cancel");
  assert.deepEqual(parsed.profile?.points, []);
});
test("profiling off has explicit metadata and no fabricated resource points", () => {
  const p = makeProfile(planFor("repeat"), false);
  assert.equal(profileSchema.parse(p).enabled, false);
  assert.equal(p.points.length, 0);
});
test("profile rejects shortened pilots, negative readings and reversed per-scope clocks", () => {
  const p = makeProfile(planFor("repeat", "timed"), true);
  assert.throws(() =>
    profileSchema.parse({ ...p, plan: { ...p.plan, activeLimitMs: 8000 } }),
  );
  const point = {
    tMs: 2,
    scope: "main" as const,
    phase: "active" as const,
    heapBytes: null,
    wasmBytes: null,
    gpuBufferBytes: null,
    eventLoopDelayMs: 0,
    samplerCostMs: 0,
  };
  assert.throws(() =>
    profileSchema.parse({ ...p, points: [point, { ...point, tMs: 1 }] }),
  );
  assert.throws(() =>
    profileSchema.parse({ ...p, points: [{ ...point, gpuBufferBytes: -1 }] }),
  );
});
test("sampling cost is tracked independently per scope", () => {
  const p = makeProfile(planFor("repeat"), true);
  const point = {
    tMs: 2,
    scope: "main" as const,
    phase: "baseline" as const,
    heapBytes: null,
    wasmBytes: null,
    gpuBufferBytes: null,
    eventLoopDelayMs: 0,
    samplerCostMs: 0.1,
  };
  recordPoint(p, point);
  recordPoint(p, { ...point, scope: "worker", samplerCostMs: 0.2 });
  assert.equal(p.overhead.mainCallbackMs, 0.1);
  assert.equal(p.overhead.workerCallbackMs, 0.2);
  assert.equal(p.points[0].heapBytes, null);
});

test("intermittent session saves its exact schedule and five-minute use window", () => {
  const p = planFor("repeat", "session");
  assert.equal(p.activeLimitMs, 300000);
  assert.deepEqual(p.sessionSchedule, {
    bursts: 3,
    burstMs: 40000,
    betweenMs: 90000,
    requestGapMs: 0,
  });
  assert.equal(
    profileSchema.parse(makeProfile(p, true)).plan.baselineMs,
    15000,
  );
  assert.equal(shouldStartRequest(p, 30, 300000), false);
  assert.throws(() =>
    profileSchema.parse(
      makeProfile({ ...p, sessionSchedule: undefined }, true),
    ),
  );
  assert.equal(planFor("short", "session").sessionSchedule, undefined);
});

test("session boundaries alternate request windows and loaded pauses without scheduling after the stop", () => {
  for (const start of [0, 130000, 260000]) {
    assert.equal(sessionWindow(start).requesting, true);
    assert.equal(sessionWindow(start + 39999).requesting, true);
    assert.equal(sessionWindow(start + 40000).requesting, false);
  }
  assert.equal(sessionWindow(40000).nextBoundaryMs, 130000);
  assert.equal(sessionWindow(170000).nextBoundaryMs, 260000);
  assert.equal(sessionWindow(299999).nextBoundaryMs, 300000);
  assert.equal(sessionWindow(300000).requesting, false);
});

test("previous paced session reports remain readable with their original pacing", () => {
  const report = JSON.parse(
    readFileSync("tests/fixtures/paced-session.json", "utf8"),
  );
  const parsed = parseReports(report)[0];
  assert.equal(parsed.profile?.plan.sessionSchedule?.requestGapMs, 4000);
  assert.equal(parsed.samples.filter((s) => !s.warmup).length, 24);
});
test("counted session permits slower models and requires exactly three twenty-response windows", () => {
  const plan = planFor("repeat", "session-count");
  assert.equal(plan.mode, "count");
  assert.equal(plan.measuredRequests, 60);
  assert.equal(plan.activeLimitMs, null);
  assert.deepEqual(plan.countSchedule, {
    bursts: 3,
    requestsPerBurst: 20,
    betweenMs: 90000,
    requestGapMs: 0,
  });
  assert.equal(shouldStartRequest(plan, 59, 900000), true);
  assert.equal(shouldStartRequest(plan, 60, 1), false);
  assert.doesNotThrow(() => profileSchema.parse(makeProfile(plan, true)));
  assert.throws(() =>
    profileSchema.parse({
      ...makeProfile(plan, true),
      plan: { ...plan, measuredRequests: 24 },
    }),
  );
  const profile = makeProfile(plan, true);
  profile.totalMs = 300000;
  profile.activeStartedMs = 15000;
  profile.activeEndedMs = 255000;
  profile.completedRequests = 60;
  profile.unloadConfirmed = true;
  profile.events = [15000, 125000, 235000].map((tMs) => ({
    tMs,
    type: "phase" as const,
    phase: "active" as const,
    label: "active",
  }));
  const samples = Array.from({ length: 60 }, (_, i) => ({
    ...legacy.samples.find((s: any) => !s.warmup),
    warmup: false,
    valid: true,
    startedMs: 15000 + Math.floor(i / 20) * 110000 + (i % 20) * 1000,
    endedMs: 16000 + Math.floor(i / 20) * 110000 + (i % 20) * 1000,
    requestIndex: i + 1,
  }));
  const report = {
    ...legacy,
    schema: "browser-inference-bench-report-v2",
    protocol: PROFILE_PROTOCOL,
    profile,
    samples,
  };
  assert.doesNotThrow(() => parseReports(report));
  const shortGap = structuredClone(report);
  shortGap.samples[20].startedMs -= 2;
  assert.throws(() => parseReports(shortGap));
  const wrongWindows = structuredClone(report);
  wrongWindows.profile.events[1].tMs += 1500;
  assert.throws(() => parseReports(wrongWindows));
});
