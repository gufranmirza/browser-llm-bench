import artifact from "../../../catalog/control-artifact.json";
import type { RunPlan } from "../protocol/schedule";
import { SAMPLE_INTERVAL_MS } from "../protocol/schedule";
import type { Phase, Point, Profile, Signal } from "../schemas/profile";
export const clockMs = () => performance.timeOrigin + performance.now();
export function makeProfile(plan: RunPlan, enabled: boolean): Profile {
  return {
    enabled,
    version: "browser-profile-v1",
    startedEpochMs: clockMs(),
    clockCalibration: {
      wallEpochMs: Date.now(),
      performanceEpochMs: clockMs(),
    },
    sampleIntervalMs: 1000,
    plan,
    points: [],
    events: [],
    signals: [],
    pressure: [],
    activeStartedMs: null,
    activeEndedMs: null,
    totalMs: 0,
    completedRequests: 0,
    stopReason: "running",
    unloadConfirmed: false,
    overhead: {
      mainCallbackMs: 0,
      workerCallbackMs: 0,
      mainCallbacks: 0,
      workerCallbacks: 0,
      mainMaxCallbackMs: 0,
      workerMaxCallbackMs: 0,
    },
    network: {
      entries: 0,
      positiveTransferBytes: null,
      zeroOrHiddenEntries: 0,
      note: "Positive transfer sizes are an observed lower bound only; zeros can mean cache or hidden cross-origin sizes, never a verified zero-byte payload.",
    },
    artifact,
  };
}
export function setSignal(profile: Profile, signal: Signal) {
  const i = profile.signals.findIndex((s) => s.id === signal.id);
  if (i < 0) profile.signals.push(signal);
  else profile.signals[i] = signal;
}
export function recordPoint(profile: Profile, point: Point) {
  if (profile.points.length >= 10000) return;
  profile.points.push(point);
  const o = profile.overhead;
  if (point.scope === "main") {
    o.mainCallbackMs += point.samplerCostMs;
    o.mainCallbacks++;
    o.mainMaxCallbackMs = Math.max(o.mainMaxCallbackMs, point.samplerCostMs);
  } else {
    o.workerCallbackMs += point.samplerCostMs;
    o.workerCallbacks++;
    o.workerMaxCallbackMs = Math.max(
      o.workerMaxCallbackMs,
      point.samplerCostMs,
    );
  }
}
export function startMainProfiler(
  profile: Profile,
  getPhase: () => Phase,
  onTick: () => void,
) {
  const perf = performance as Performance & {
    memory?: { usedJSHeapSize: number };
    measureUserAgentSpecificMemory?: () => Promise<unknown>;
  };
  const signal = (
    id: string,
    label: string,
    source: string,
    unit: string,
    status: Signal["status"],
    reason: string,
  ) =>
    setSignal(profile, {
      id,
      label,
      scope: "main page",
      source,
      unit,
      status,
      reason,
    });
  signal(
    "main-heap",
    "Main-page JS heap",
    "performance.memory.usedJSHeapSize",
    "bytes",
    !profile.enabled ? "disabled" : perf.memory ? "available" : "unavailable",
    !profile.enabled
      ? "Sampling disabled for overhead reference."
      : perf.memory
        ? "Nonstandard browser estimate, possibly rounded/shared; excludes worker and GPU."
        : "performance.memory is not exposed in this context.",
  );
  signal(
    "main-lag",
    "Main-page timer delay",
    "1-second setInterval scheduling drift",
    "ms",
    profile.enabled ? "available" : "disabled",
    "Responsiveness, not CPU utilization. Delayed samples retain actual timestamps.",
  );
  signal(
    "cpu-percent",
    "Process CPU utilization",
    "No standard page API",
    "percent",
    "unavailable",
    "Exact process CPU percent requires an external OS/browser lab collector. Timer delay and CPU pressure are not CPU percent.",
  );
  signal(
    "resident-memory",
    "Process RAM / physical GPU VRAM",
    "No public page API",
    "bytes",
    "unavailable",
    "Requires external process/GPU instrumentation; WebGPU buffer descriptors do not expose residency.",
  );
  signal(
    "ua-memory",
    "Cross-context memory estimate",
    "performance.measureUserAgentSpecificMemory",
    "bytes",
    "unavailable",
    !globalThis.crossOriginIsolated
      ? "Cross-origin isolation is false; this API requires isolation and browser support."
      : !perf.measureUserAgentSpecificMemory
        ? "API is not exposed by this browser."
        : "API exists but is not sampled by this low-overhead protocol because it may trigger GC; optional future idle-only collector.",
  );
  let pressureObserver:
    | {
        disconnect: () => void;
        observe: (
          source: string,
          options: { sampleInterval: number },
        ) => Promise<void>;
      }
    | undefined;
  const pressure = (
    globalThis as unknown as {
      PressureObserver?: new (
        cb: (records: { state: string; time: number }[]) => void,
      ) => typeof pressureObserver;
    }
  ).PressureObserver;
  signal(
    "cpu-pressure",
    "CPU pressure",
    "PressureObserver / system-wide coarse state",
    "state",
    profile.enabled && pressure
      ? "pending"
      : profile.enabled
        ? "unavailable"
        : "disabled",
    !profile.enabled
      ? "Profiling disabled."
      : pressure
        ? "Observer is starting; availability requires real readings."
        : "PressureObserver is not exposed by this browser.",
  );
  let stopped = false;
  if (profile.enabled && pressure) {
    try {
      pressureObserver = new pressure((records) => {
        if (stopped) return;
        for (const r of records) {
          if (
            ["nominal", "fair", "serious", "critical"].includes(r.state) &&
            profile.pressure.length < 2000
          )
            profile.pressure.push({
              tMs: Math.max(
                0,
                performance.timeOrigin + r.time - profile.startedEpochMs,
              ),
              state: r.state as Profile["pressure"][number]["state"],
            });
        }
        signal(
          "cpu-pressure",
          "CPU pressure",
          "PressureObserver / system-wide coarse state",
          "state",
          "available",
          "Observed coarse system pressure. Not per-process usage and not a CPU percentage.",
        );
      });
      pressureObserver
        ?.observe("cpu", { sampleInterval: 1000 })
        .catch((e) =>
          signal(
            "cpu-pressure",
            "CPU pressure",
            "PressureObserver",
            "state",
            "unavailable",
            `${e.name}: ${e.message}`,
          ),
        );
    } catch (e) {
      signal(
        "cpu-pressure",
        "CPU pressure",
        "PressureObserver",
        "state",
        "unavailable",
        String(e),
      );
    }
  }
  let previous = performance.now();
  const sample = () => {
    const start = performance.now(),
      now = clockMs();
    if (profile.enabled) {
      const heap = perf.memory?.usedJSHeapSize;
      const point: Point = {
        tMs: Math.max(0, now - profile.startedEpochMs),
        scope: "main",
        phase: getPhase(),
        heapBytes: typeof heap === "number" ? heap : null,
        wasmBytes: null,
        gpuBufferBytes: null,
        eventLoopDelayMs: Math.max(0, start - previous - SAMPLE_INTERVAL_MS),
        samplerCostMs: 0,
      };
      point.samplerCostMs = performance.now() - start;
      recordPoint(profile, point);
    }
    previous = start;
    onTick();
  };
  sample();
  const timer = setInterval(sample, SAMPLE_INTERVAL_MS);
  return () => {
    if (stopped) return;
    sample();
    stopped = true;
    clearInterval(timer);
    pressureObserver?.disconnect();
    const p = profile.signals.find((s) => s.id === "cpu-pressure");
    if (p?.status === "pending") {
      p.status = "unavailable";
      p.reason = "Observer started but produced no records during this run.";
    }
  };
}
