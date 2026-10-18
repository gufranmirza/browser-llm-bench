import type { Report } from "../schemas/report";
import { timelineWindow } from "./timeline";

export function resourceWindow(report: Report, phase = "all") {
  const full = report.profile ? timelineWindow(report.profile) : null;
  const phases = full?.phases ?? [];
  const useStart = phases.find((p) => p.phase === "active")?.startMs;
  const releaseStart = phases.find((p) => p.phase === "unload")?.startMs;
  const end = full?.endMs ?? 1;
  const groups = [
    {
      id: "setup",
      label: "Setup",
      detail: "Baseline, loading & warmup",
      startMs: 0,
      endMs: useStart ?? releaseStart ?? end,
    },
    ...(useStart === undefined
      ? []
      : [
          {
            id: "use",
            label: "Use",
            detail: "Requests & loaded idle",
            startMs: useStart,
            endMs: releaseStart ?? end,
          },
        ]),
    ...(releaseStart === undefined
      ? []
      : [
          {
            id: "release",
            label: "Release",
            detail: "Unload & observation",
            startMs: releaseStart,
            endMs: end,
          },
        ]),
  ].filter((g) => g.endMs > g.startMs);
  const selected =
    groups.find((g) => g.id === phase) ??
    (phase.startsWith("interval:")
      ? phases[Number(phase.slice(9))]
      : phases.find((p) => p.phase === phase));
  const startMs = selected?.startMs ?? 0;
  const endMs = selected?.endMs ?? end;
  const ticks = Array.from(
    { length: 5 },
    (_, i) => (startMs + ((endMs - startMs) * i) / 4) / 1000,
  );
  return { startMs, endMs, ticks, phases, groups };
}
export function resourceSeries(report: Report, phase = "all") {
  const window = resourceWindow(report, phase);
  const inside = (t: number) => t >= window.startMs && t <= window.endMs;
  const native = report.nativeTrace;
  const cpus = native?.logicalCpus ?? 0;
  // Interval counters crossing a selected boundary cannot be attributed to that phase.
  const processes = (native?.points ?? [])
    .map((p, i, all) => ({
      time: p.tMs / 1000,
      cpu:
        i > 0 &&
        all[i - 1].tMs >= window.startMs &&
        cpus > 0 &&
        p.cpuOneCorePercent !== null
          ? p.cpuOneCorePercent / cpus
          : null,
      footprint: p.footprintBytes === null ? null : p.footprintBytes / 1e6,
      gpu: p.hostGpuUtilizationPercent,
    }))
    .filter((p) => inside(p.time * 1000));
  const power = (native?.power ?? [])
    .filter((p) => inside(p.tMs))
    .map((p) => ({
      time: p.tMs / 1000,
      cpu: p.tMs - p.intervalMs >= window.startMs ? p.cpuWatts : null,
      gpu: p.tMs - p.intervalMs >= window.startMs ? p.gpuWatts : null,
      ane: p.tMs - p.intervalMs >= window.startMs ? p.aneWatts : null,
    }));
  const browserGpu = (native?.gpu ?? [])
    .filter((p) => inside(p.tMs))
    .map((p) => ({
      time: p.tMs / 1000,
      gpuTime:
        p.startMs !== null &&
        p.startMs >= window.startMs &&
        p.intervalMs !== null &&
        p.intervalMs > 0 &&
        p.gpuTimeMs !== null &&
        !p.issues.length
          ? (p.gpuTimeMs * 1000) / p.intervalMs
          : null,
    }));
  const worker = (report.profile?.points ?? [])
    .filter((p) => p.scope === "worker" && inside(p.tMs))
    .map((p) => ({
      time: p.tMs / 1000,
      wasm: p.wasmBytes === null ? null : p.wasmBytes / 1e6,
      buffers: p.gpuBufferBytes === null ? null : p.gpuBufferBytes / 1e6,
      heap: p.heapBytes === null ? null : p.heapBytes / 1e6,
      lag: p.eventLoopDelayMs,
    }));
  const main = (report.profile?.points ?? [])
    .filter((p) => p.scope === "main" && inside(p.tMs))
    .map((p) => ({
      time: p.tMs / 1000,
      heap: p.heapBytes === null ? null : p.heapBytes / 1e6,
      lag: p.eventLoopDelayMs,
    }));
  return { window, processes, power, worker, main, browserGpu };
}
export function observedPeak(
  data: { [key: string]: number | null }[],
  key: string,
) {
  const values = data.flatMap((p) => (p[key] == null ? [] : [p[key]!]));
  return values.length ? Math.max(...values) : null;
}
