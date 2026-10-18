import { useEffect, useRef, useState } from "react";
import type { RunSettings } from "../../benchmark/protocol/settings";
import {
  defaultRunSettings,
  runSettingsSchema,
} from "../../benchmark/protocol/settings";
import live from "../../benchmark/runtime/catalog";
import { MODEL, PROFILE_PROTOCOL } from "../../benchmark/schemas/report";
import { assetUrl } from "../../lib/urls";
import type { BrowserCapabilities } from "../capabilities/detect";

import {
  clockMs,
  makeProfile,
  recordPoint,
  setSignal,
  startMainProfiler,
} from "../../benchmark/metrics/browser-profiler";
import type { RepeatMode } from "../../benchmark/protocol/schedule";
import { planFor } from "../../benchmark/protocol/schedule";
import type { Phase } from "../../benchmark/schemas/profile";
import type { Report, Sample } from "../../benchmark/schemas/report";
export function useBenchmark(onReport: (r: Report) => void) {
  const [capability, setCapability] = useState("Checking WebGPU…"),
    [supported, setSupported] = useState(false),
    [gpuFeatures, setGpuFeatures] = useState<string[]>([]),
    [maxBufferSize, setMaxBufferSize] = useState(0),
    [adapter, setAdapter] = useState<string | null>(null),
    [active, setActive] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [phase, setPhase] = useState("Ready to run"),
    [progress, setProgress] = useState(0),
    [output, setOutput] = useState(""),
    [last, setLast] = useState<Report | null>(null),
    [elapsed, setElapsed] = useState(0),
    [completed, setCompleted] = useState(0);
  const worker = useRef<Worker | null>(null),
    report = useRef<Report | null>(null),
    phaseRef = useRef<Phase>("baseline"),
    stopSampler = useRef<(() => void) | undefined>(undefined),
    timers = useRef<ReturnType<typeof setTimeout>[]>([]),
    requestTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    onReportRef = useRef(onReport);
  onReportRef.current = onReport;
  const labels: Record<Phase, string> = {
    baseline: "Recording baseline",
    load: "Loading model assets",
    warmup: "Warmup · excluded from measurements",
    active: "Measuring requests",
    idle: "Idle · model stays loaded",
    unload: "Unloading the model",
    recovery: "Observing after unload",
    finished: "Run complete",
  };
  useEffect(() => {
    let mounted = true;
    const gpu = (navigator as any).gpu;
    if (!gpu) {
      setCapability("WebGPU is unavailable in this browser");
      return;
    }
    gpu
      .requestAdapter()
      .then((a: any) => {
        if (!mounted) return;
        setSupported(!!a);
        setGpuFeatures(a ? Array.from(a.features) : []);
        setMaxBufferSize(a?.limits.maxBufferSize ?? 0);
        setCapability(
          !a
            ? "No WebGPU adapter available"
            : !a.features.has("shader-f16")
              ? "WebGPU available · FP32 compute only"
              : "WebGPU + shader-f16 available",
        );
        setAdapter(
          a?.info
            ? JSON.stringify({
                vendor: a.info.vendor || "Not exposed",
                architecture: a.info.architecture || "Not exposed",
                device: a.info.device || "Not exposed",
                description: a.info.description || "Not exposed",
              })
            : null,
        );
      })
      .catch((e: unknown) => setCapability(String(e)));
    return () => {
      mounted = false;
    };
  }, []);
  function finish(
    status: Report["status"],
    diagnostic?: string,
    forced = false,
  ) {
    const r = report.current;
    if (!r) return;
    stopSampler.current?.();
    stopSampler.current = undefined;
    report.current = null;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    clearTimeout(requestTimer.current);
    if (diagnostic && r.diagnostics.length < 100)
      r.diagnostics.push(diagnostic);
    const p = r.profile!;
    p.totalMs = clockMs() - p.startedEpochMs;
    if (forced) {
      p.events.push({
        tMs: p.totalMs,
        type: "forced-termination",
        phase: phaseRef.current,
        label: diagnostic ?? "Worker terminated",
      });
      p.stopReason = diagnostic ?? status;
      p.unloadConfirmed = false;
      if (p.activeStartedMs !== null && p.activeEndedMs === null)
        p.activeEndedMs = p.totalMs;
    }
    p.events.sort((a, b) => a.tMs - b.tMs);
    r.status = status;
    r.memory.jsHeapBytes = (performance as any).memory?.usedJSHeapSize ?? null;
    const lags = p.points.filter(
      (x) => x.scope === "main" && x.eventLoopDelayMs !== null,
    );
    r.responsiveness = {
      samples: lags.length,
      maxEventLoopDelayMs: Math.max(0, ...lags.map((x) => x.eventLoopDelayMs!)),
    };
    worker.current?.terminate();
    worker.current = null;
    setLast(r);
    setActive(false);
    setCancelling(false);
    setElapsed(p.totalMs);
    setPhase(
      status === "complete"
        ? "Run complete"
        : status === "cancelled"
          ? "Run cancelled"
          : status === "interrupted"
            ? "Run interrupted"
            : status === "unsupported"
              ? "Configuration unsupported"
              : "Run failed",
    );
    onReportRef.current(r);
  }
  function stop(
    status: Report["status"] = "cancelled",
    reason = "Stopped by user",
  ) {
    if (!report.current) return;
    setCancelling(true);
    setPhase("Stopping request and unloading…");
    worker.current?.postMessage({ type: "cancel", status, reason });
    timers.current.push(
      setTimeout(
        () =>
          finish(
            status,
            `${reason}; cleanup did not acknowledge within the configured grace period`,
            true,
          ),
        15000 + (report.current?.profile?.plan.recoveryMs ?? 2000),
      ),
    );
  }
  useEffect(() => {
    const hidden = () => {
      const r = report.current;
      if (!r) return;
      if (
        r.profile &&
        (r.profile.plan.sessionSchedule || r.profile.plan.countSchedule)
      ) {
        r.profile.events.push({
          tMs: Math.max(0, clockMs() - r.profile.startedEpochMs),
          type: "visibility",
          phase: phaseRef.current,
          label: document.hidden
            ? "Page hidden; session continues under browser background policy"
            : "Page visible again",
        });
        return;
      }
      if (document.hidden)
        finish(
          "interrupted",
          "Page became hidden; worker terminated. Unload/recovery could not be observed.",
          true,
        );
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      if (report.current)
        finish(
          "interrupted",
          "Navigated away; worker terminated. Unload/recovery could not be observed.",
          true,
        );
    };
  }, []);
  function run(
    work: string,
    mode: RepeatMode,
    profiling: boolean,
    device: string,
    modelId: string = MODEL,
    options?: RunSettings,
    browserCapabilities?: BrowserCapabilities,
  ) {
    if (report.current) return;
    const pin = live.models.find((m) => m.id === modelId);
    if (!pin) throw Error("Unknown artifact");
    const settings = runSettingsSchema.parse(
      options ?? defaultRunSettings(work),
    );
    if (!pin.thinkingDisabled && settings.thinking)
      throw Error("Thinking control is unavailable for this model");
    const plan = planFor(work, mode, settings),
      profile = makeProfile(plan, profiling);
    profile.artifact = pin.artifact;
    const r: Report = {
      schema: "browser-inference-bench-report-v2",
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      source: "local",
      protocol: PROFILE_PROTOCOL,
      model: pin.id,
      revision: pin.revision,
      modelUrl: pin.modelUrl,
      quantization: pin.quantization as Report["quantization"],
      runtime: pin.runtime,
      executionBackend: "webgpu",
      resourcePolicy: "browser-managed; no dedicated resource reservation",
      workload: work,
      status: "failed",
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        deviceLabel: device.trim() || "This device",
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        webgpu: supported,
        adapter,
        browserCapabilities,
      },
      settings: {
        thinkingMode: pin.thinkingDisabled
          ? settings.thinking
            ? "enabled"
            : "disabled"
          : "not-applicable",
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: settings.maxTokens,
        contextWindow: settings.contextWindow,
        warmups: settings.warmups,
        warmupTokens: settings.warmupTokens,
        repeats: plan.measuredRequests,
        seed: settings.seed,
      },
      cache: "Unknown",
      loadMs: null,
      firstPreparationMs: null,
      downloadBytes: null,
      downloadMs: null,
      memory: {
        jsHeapBytes: null,
        gpuBytes: null,
        note: "Main-page browser JS-heap estimate only; excludes worker and physical GPU memory. See separately scoped profile signals.",
      },
      responsiveness: { maxEventLoopDelayMs: 0, samples: 0 },
      samples: [],
      diagnostics: [
        "Weight-shard size comes from the pinned manifest; actual transferred bytes are not equated with artifact size.",
        "Request first output is the first nonempty text chunk, not exact first-token time.",
        plan.countSchedule
          ? "60 measured requests: 3 windows of 20 sequential requests, no added delay within windows, full 90-second loaded-idle gaps after responses 20 and 40. Configured warmups excluded. Configured request and 30-minute session safety limits; timeouts are incomplete, not successful results."
          : plan.sessionSchedule
            ? "Five-minute intermittent session: 3 x 40s request windows, 90s scheduled between windows and no deliberate gap between requests. The last in-flight request finishes; its overrun shortens the next scheduled idle interval. Same worker/engine remains loaded. activeStartedMs/activeEndedMs bound the use session including deliberate pauses, not pure inference time."
            : plan.mode === "count"
              ? "Counted requests start after loading and warmup; each chat resets, then the next request starts without an added pause. Configured warmups are excluded. Request and total-session safety limits still apply."
              : "Timed active period starts after loading and warmup; final in-flight request completes. Configured request timeout, 1,000-request ceiling and 15-minute total limit.",
      ],
      profile,
    };
    report.current = r;
    phaseRef.current = "baseline";
    setLast(null);
    setCompleted(0);
    setElapsed(0);
    setOutput("");
    setProgress(0);
    setCancelling(false);
    const missingFeatures = pin.requiredFeatures.filter(
      (f) => !gpuFeatures.includes(f),
    );
    if (
      !supported ||
      missingFeatures.length ||
      maxBufferSize < pin.bufferSizeRequiredBytes
    ) {
      finish(
        "unsupported",
        !supported
          ? capability
          : missingFeatures.length
            ? `Missing GPU features: ${missingFeatures.join(", ")}`
            : "GPU buffer limit is smaller than this artifact requires",
        true,
      );
      return;
    }
    if (document.hidden) {
      finish("interrupted", "Run requires visible page", true);
      return;
    }
    setActive(true);
    setPhase(labels.baseline);
    stopSampler.current = startMainProfiler(
      profile,
      () => phaseRef.current,
      () => {
        setElapsed(clockMs() - profile.startedEpochMs);
      },
    );
    profile.events.push({
      tMs: 0,
      type: "phase",
      phase: "baseline",
      label: "Run started; main-page baseline",
    });
    timers.current.push(
      setTimeout(
        () =>
          stop(
            "failed",
            `${plan.totalLimitMs / 60000}-minute total safety limit reached`,
          ),
        plan.totalLimitMs,
      ),
    );
    try {
      const w = new Worker(assetUrl("/benchmark-worker/benchmark.worker.js"), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (e) => {
        if (report.current !== r) return;
        const { type, data } = e.data;
        if (type === "artifact") r.modelLib = data.modelLib;
        if (type === "cache") r.cache = data;
        if (type === "loaded") {
          r.loadMs = data;
          setProgress(100);
        }
        if (type === "progress") {
          setProgress(Math.min(100, Math.max(0, data.progress * 100)));
        }
        if (type === "phase") {
          phaseRef.current = data;
          setPhase(labels[data as Phase]);
        }
        if (type === "event") {
          if (profile.events.length < 6000) profile.events.push(data);
          if (data.type === "request-start") {
            clearTimeout(requestTimer.current);
            requestTimer.current = setTimeout(
              () =>
                stop(
                  "failed",
                  `Request did not settle within ${plan.requestLimitMs / 1000 + 5} seconds`,
                ),
              plan.requestLimitMs + 5000,
            );
          }
          if (data.type === "request-end") clearTimeout(requestTimer.current);
        }
        if (type === "point") recordPoint(profile, data);
        if (type === "signal") setSignal(profile, data);
        if (type === "network") profile.network = data;
        if (type === "active-start") profile.activeStartedMs = data;
        if (type === "active-end") profile.activeEndedMs = data;
        if (type === "output") setOutput(data);
        if (type === "count") {
          profile.completedRequests = data;
          setCompleted(data);
        }
        if (type === "sample") {
          r.samples.push(data as Sample);
          if (data.warmup && r.firstPreparationMs === null)
            r.firstPreparationMs = data.responseMs;
        }
        if (type === "diagnostic" && r.diagnostics.length < 100)
          r.diagnostics.push(data);
        if (type === "done") {
          Object.assign(profile, {
            stopReason: data.reason,
            activeStartedMs: data.activeStartedMs,
            activeEndedMs: data.activeEndedMs,
            completedRequests: data.completedRequests,
            unloadConfirmed: data.unloadConfirmed,
            totalMs: data.totalMs,
          });
          const valid = r.samples.every((s) => s.valid);
          finish(
            data.status === "complete" && !valid ? "failed" : data.status,
            valid ? undefined : "Basic output validity check failed",
          );
        }
      };
      w.onerror = (e) =>
        finish("failed", e.message || "Worker initialization failure", true);
      w.postMessage({
        type: "start",
        model: pin,
        workload: work,
        plan,
        startedEpochMs: profile.startedEpochMs,
        profiling,
        settings,
      });
    } catch (e) {
      finish("failed", String(e), true);
    }
  }
  return {
    capability,
    supported,
    gpuFeatures,
    maxBufferSize,
    active,
    cancelling,
    phase,
    progress,
    output,
    last,
    elapsed,
    completed,
    current: report.current,
    run,
    stop,
  };
}
