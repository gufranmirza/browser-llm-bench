import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  nativeRunPoints,
  powerRunPoints,
  timelineWindow,
  withinRun,
} from "../../src/benchmark/metrics/timeline";
import type { Report } from "../../src/benchmark/schemas/report";

const report: Report = JSON.parse(
  readFileSync("tests/fixtures/native-timeline.json", "utf8"),
);
const profile = report.profile!;
const trace = report.nativeTrace!;

test("saved graphs stop at browser stop, despite late events and native capture context", () => {
  const window = timelineWindow(profile);
  assert.equal(window.endMs, profile.totalMs);
  assert.ok(profile.events.some((e) => e.tMs > window.endMs));
  assert.equal(window.ticks[0], 0);
  assert.equal(window.ticks.at(-1), profile.totalMs / 1000);
  for (const points of [
    withinRun(profile.points, window.endMs),
    nativeRunPoints(trace, window.endMs),
    powerRunPoints(trace, window.endMs),
  ]) {
    assert.ok(points.length > 0);
    assert.ok(points.every((p) => p.tMs >= 0 && p.tMs <= window.endMs));
  }
  assert.equal(nativeRunPoints(trace, window.endMs).length, 104);
});

test("CPU and power intervals crossing zero are missing, never pre-run averages", () => {
  const points = nativeRunPoints(trace, profile.totalMs);
  assert.equal(points[0].cpuOneCorePercent, null);
  assert.ok(points[1].cpuOneCorePercent !== null);
  const power = powerRunPoints(trace, profile.totalMs);
  assert.ok(
    power.every((p) => p.tMs - p.intervalMs >= 0 || p.combinedWatts === null),
  );
  // Display trimming never modifies saved evidence.
  assert.ok(trace.points.some((p) => p.tMs < 0));
  assert.ok(trace.points.some((p) => p.tMs > profile.totalMs));
  assert.ok(
    trace.points.find((p) => p.tMs === points[0].tMs)!.cpuOneCorePercent !==
      null,
  );
});

test("phase bands use actual inference boundaries and clip cleanup at browser stop", () => {
  const window = timelineWindow(profile);
  const active = window.phases.find((p) => p.phase === "active")!;
  assert.equal(active.startMs, profile.activeStartedMs);
  assert.equal(active.endMs, profile.activeEndedMs);
  assert.equal(window.phases.at(-1)!.endMs, profile.totalMs);
  assert.ok(
    window.phases.every(
      (p) =>
        p.startMs >= 0 && p.startMs < p.endMs && p.endMs <= profile.totalMs,
    ),
  );
});

test("live charts can advance while the saved total has not yet updated", () => {
  const pending = { ...profile, totalMs: 0 };
  assert.ok(timelineWindow(pending, true).endMs >= profile.activeEndedMs!);
});
