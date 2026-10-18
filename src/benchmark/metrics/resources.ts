import type { Row } from "../../features/leaderboard/data";
import { median } from "../../features/leaderboard/data";
import type { Report } from "../schemas/report";
import { timelineWindow } from "./timeline";

type Window = { startMs: number; endMs: number };
export type ResourceSummary = {
  peakMemory: number | null;
  idleMemory: number | null;
  releasedMemory: number | null;
  cpu: number | null;
  gpuTime: number | null;
  power: number | null;
  cpuCoverage: number;
  gpuCoverage: number;
  powerCoverage: number;
};
// Only complete sampling intervals inside a request window can be attributed to inference.
// Boundary-crossing intervals and missing telemetry are excluded, never zero-filled.
export function intervalAverage(
  points: { start: number; end: number; value: number | null }[],
  windows: Window[],
) {
  const duration = windows.reduce((sum, w) => sum + w.endMs - w.startMs, 0);
  let weighted = 0,
    covered = 0,
    previousEnd = -Infinity;
  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value) || p.end <= p.start)
      continue;
    if (!windows.some((w) => p.start >= w.startMs && p.end <= w.endMs))
      continue;
    // Collector timestamps may overlap slightly; account for each elapsed instant once.
    const start = Math.max(p.start, previousEnd);
    if (p.end <= start) continue;
    weighted += p.value * (p.end - start);
    covered += p.end - start;
    previousEnd = p.end;
  }
  return {
    value: covered ? weighted / covered : null,
    coverage: duration ? Math.min(1, covered / duration) : 0,
  };
}
export function summarizeResources(report?: Report): ResourceSummary {
  const empty: ResourceSummary = {
    peakMemory: null,
    idleMemory: null,
    releasedMemory: null,
    cpu: null,
    gpuTime: null,
    power: null,
    cpuCoverage: 0,
    gpuCoverage: 0,
    powerCoverage: 0,
  };
  const profile = report?.profile,
    trace = report?.nativeTrace;
  if (!profile || !trace) return empty;
  const { phases, endMs } = timelineWindow(profile);
  const active = phases.filter((p) => p.phase === "active");
  const lastActive = active.at(-1)?.endMs ?? Infinity;
  const idle = phases.filter(
    (p) => p.phase === "idle" && p.startMs >= lastActive,
  );
  const after = phases.filter((p) => p.phase === "recovery");
  const memory = trace.points.filter(
    (p) => p.tMs >= 0 && p.tMs <= endMs && p.footprintBytes !== null,
  );
  const inWindows = (t: number, windows: Window[]) =>
    windows.some((w) => t >= w.startMs && t < w.endMs);
  const cpu = intervalAverage(
    trace.points.map((p, i, a) => ({
      start: a[i - 1]?.tMs ?? p.tMs,
      end: p.tMs,
      value:
        p.incompleteCpuIntervals === 0 &&
        trace.logicalCpus > 0 &&
        p.cpuOneCorePercent !== null
          ? p.cpuOneCorePercent / trace.logicalCpus
          : null,
    })),
    active,
  );
  const gpu = intervalAverage(
    (trace.gpu ?? []).map((p) => ({
      start: p.startMs ?? p.tMs,
      end: p.tMs,
      value:
        p.gpuTimeMs !== null && p.intervalMs && !p.issues.length
          ? (p.gpuTimeMs * 1000) / p.intervalMs
          : null,
    })),
    active,
  );
  const power = intervalAverage(
    trace.power.map((p) => ({
      start: p.tMs - p.intervalMs,
      end: p.tMs,
      value: p.combinedWatts,
    })),
    active,
  );
  return {
    peakMemory: memory.length
      ? Math.max(...memory.map((p) => p.footprintBytes!)) / 1e9
      : null,
    idleMemory: scaleMedian(
      memory
        .filter((p) => inWindows(p.tMs, idle))
        .map((p) => p.footprintBytes!),
    ),
    releasedMemory: scaleMedian(
      memory
        .filter((p) => inWindows(p.tMs, after))
        .map((p) => p.footprintBytes!),
    ),
    cpu: cpu.value,
    gpuTime: gpu.value,
    power: power.value,
    cpuCoverage: cpu.coverage,
    gpuCoverage: gpu.coverage,
    powerCoverage: power.coverage,
  };
}
function scaleMedian(values: number[]) {
  const value = median(values);
  return value === null ? null : value / 1e9;
}
export function protocolLabel(row: Row) {
  const plan = row.report?.profile?.plan;
  if (plan?.countSchedule) return "60 requests · 3 × 20 · 90 s idle";
  if (plan?.sessionSchedule)
    return `3 × ${plan.sessionSchedule.burstMs / 1000}s · ${plan.sessionSchedule.requestGapMs / 1000}s pacing`;
  return row.workload;
}
export function comparisonKey(row: Row) {
  const r = row.report;
  // Models vary; environment, prompts, generation settings and run schedule do not.
  return JSON.stringify([
    row.device,
    row.browser,
    row.runtime,
    row.cache,
    row.protocol,
    row.workload,
    r?.environment.hardwareConcurrency,
    r?.environment.adapter,
    r?.profile?.plan,
    r && [
      r.settings.temperature,
      r.settings.topP,
      r.settings.maxTokens,
      r.settings.contextWindow,
      r.settings.seed,
      r.settings.warmups,
      r.settings.warmupTokens ?? 16,
      r.settings.thinkingMode === "enabled",
    ],
    [
      ...new Set(
        r?.samples.filter((s) => !s.warmup).map((s) => s.prompt) ?? [],
      ),
    ],
  ]);
}
