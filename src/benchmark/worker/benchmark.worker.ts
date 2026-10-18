/// <reference lib="webworker" />
import type { CompletionUsage } from "@mlc-ai/web-llm";

import type { MLCEngine } from "@mlc-ai/web-llm";
import { clockMs } from "../metrics/browser-profiler";
import type { RunPlan } from "../protocol/schedule";
import { sessionWindow, shouldStartRequest } from "../protocol/schedule";
import type { RunSettings } from "../protocol/settings";
import { generationOptions } from "../protocol/settings";
import { workload } from "../protocol/workloads";
import type { RunnableModel } from "../runtime/catalog";
import type { Phase } from "../schemas/profile";
import { instrumentWorker } from "./instrumentation";
const send = (type: string, data: unknown) => self.postMessage({ type, data });
let engine: MLCEngine | undefined;
let stopReason: string | null = null,
  stopStatus: "cancelled" | "interrupted" | "failed" = "cancelled";
self.onmessage = (e) => {
  if (e.data.type === "cancel") {
    stopReason = e.data.reason;
    stopStatus = e.data.status;
    void engine?.interruptGenerate().catch(() => {});
    return;
  }
  if (e.data.type === "start") void run(e.data);
};
async function run({
  model,
  workload: work,
  plan,
  startedEpochMs,
  profiling,
  settings,
}: {
  model: RunnableModel;
  settings: RunSettings;
  workload: string;
  plan: RunPlan;
  startedEpochMs: number;
  profiling: boolean;
}) {
  let phase: Phase = "baseline",
    completed = 0,
    activeStart: number | null = null,
    activeEnd: number | null = null,
    unloaded = false,
    status = "complete",
    reason = "request-count";
  const now = () => Math.max(0, clockMs() - startedEpochMs);
  const event = (type: string, label: string, requestIndex?: number) =>
    send("event", {
      tMs: now(),
      type,
      phase,
      label,
      ...(requestIndex !== undefined ? { requestIndex } : {}),
    });
  const setPhase = (next: Phase) => {
    phase = next;
    event("phase", next);
    send("phase", next);
    profiler.sample();
  };
  const profiler = instrumentWorker(
    startedEpochMs,
    profiling,
    () => phase,
    send,
    (message) => {
      stopReason = message;
      stopStatus = "failed";
      event("failure", message);
      void engine?.interruptGenerate().catch(() => {});
    },
  );
  const pause = async (ms: number, interruptible = true) => {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      if (interruptible && stopReason) throw Error(stopReason);
      await new Promise((r) =>
        setTimeout(r, Math.min(100, end - performance.now())),
      );
    }
  };
  try {
    setPhase("baseline");
    await pause(plan.baselineMs);
    setPhase("load");
    // Each binary package stays paired with the runtime it was compiled for.
    const runtime =
      model.runtime === "WebLLM 0.2.86"
        ? ((await import("@mlc-ai/web-llm-next")) as unknown as typeof import("@mlc-ai/web-llm"))
        : await import("@mlc-ai/web-llm");
    const { prebuiltAppConfig, hasModelInCache, CreateMLCEngine } = runtime;
    const record =
      model.record ??
      prebuiltAppConfig.model_list.find((m) => m.model_id === model.id);
    if (!record) throw Error("Artifact is missing its runtime configuration");
    const config = {
      ...prebuiltAppConfig,
      model_list: [
        { ...record, model: model.modelUrl, model_lib: model.modelLib },
      ],
    };
    send("artifact", { modelLib: model.modelLib });
    const cached = await hasModelInCache(model.id, config).catch(() => null);
    send(
      "cache",
      cached === null
        ? "Unknown"
        : cached
          ? "Weight cache present; completeness not guaranteed"
          : "No weight cache detected; other asset caches unknown",
    );
    const loadStart = performance.now();
    engine = await CreateMLCEngine(
      model.id,
      {
        appConfig: config,
        initProgressCallback: (p) =>
          send("progress", { progress: p.progress, text: p.text }),
      },
      { ...record.overrides, context_window_size: settings.contextWindow },
    );
    send("loaded", performance.now() - loadStart);
    if (stopReason) throw Error(stopReason);
    const prompts = workload(work);
    async function request(warmup: boolean, index: number) {
      if (stopReason) throw Error(stopReason);
      await engine!.resetChat();
      const prompt = warmup
        ? "Say hello in one short sentence."
        : work === "repeat"
          ? prompts[0]
          : prompts[index];
      const started = now();
      event(
        "request-start",
        warmup ? "Warmup" : `Request ${index + 1}`,
        warmup ? 0 : index + 1,
      );
      let first: number | null = null,
        output = "",
        usage: CompletionUsage | undefined,
        finish = "unknown",
        lastOutputAt = 0;
      const timer = setTimeout(() => {
        stopReason = `Request exceeded ${plan.requestLimitMs / 1000}-second limit`;
        stopStatus = "failed";
        void engine?.interruptGenerate().catch(() => {});
      }, plan.requestLimitMs);
      try {
        const stream = await engine!.chat.completions.create({
          ...generationOptions(settings, warmup, model.thinkingDisabled),
          messages: [{ role: "user", content: prompt }],
          stream: true,
          stream_options: { include_usage: true },
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta.content ?? "";
          if (text && first === null) first = now() - started;
          output += text;
          if (chunk.usage) usage = chunk.usage;
          if (chunk.choices[0]?.finish_reason)
            finish = chunk.choices[0].finish_reason;
          // UI output updates capped at 4 Hz; inference and recorded text remain complete.
          if (text && performance.now() - lastOutputAt > 250) {
            send("output", output);
            lastOutputAt = performance.now();
          }
        }
      } finally {
        clearTimeout(timer);
      }
      send("output", output);
      const ended = now();
      send("sample", {
        prompt,
        output,
        inputTokens: usage?.prompt_tokens ?? null,
        outputTokens: usage?.completion_tokens ?? null,
        firstOutputMs: first,
        responseMs: ended - started,
        decodeTokensPerSecond: usage?.extra?.decode_tokens_per_s ?? null,
        finishReason: stopReason ? "interrupted" : finish,
        valid:
          !stopReason &&
          output.trim().length > 0 &&
          !output.includes("\uFFFD") &&
          (usage?.completion_tokens ?? 0) > 0,
        warmup,
        startedMs: started,
        endedMs: ended,
        requestIndex: warmup ? 0 : index + 1,
      });
      event(
        "request-end",
        warmup ? "Warmup complete" : `Request ${index + 1} complete`,
        warmup ? 0 : index + 1,
      );
      if (
        !stopReason &&
        (!output.trim() ||
          output.includes("\uFFFD") ||
          !usage?.completion_tokens)
      )
        event(
          "failure",
          `Request ${warmup ? "warmup" : index + 1} failed basic output validity`,
          warmup ? 0 : index + 1,
        );
      if (
        !output.trim() ||
        output.includes("\uFFFD") ||
        !usage?.completion_tokens
      )
        throw Error("Invalid response; session incomplete");
      if (stopReason) throw Error(stopReason);
    }
    if (settings.warmups > 0) setPhase("warmup");
    for (let i = 0; i < settings.warmups; i++) await request(true, i);
    setPhase("active");
    activeStart = now();
    send("active-start", activeStart);
    while (shouldStartRequest(plan, completed, now() - activeStart)) {
      if (plan.sessionSchedule) {
        const window = sessionWindow(now() - activeStart);
        if (!window.requesting) {
          if ((phase as Phase) !== "idle") setPhase("idle");
          await pause(Math.max(0, activeStart + window.nextBoundaryMs - now()));
          continue;
        }
        if ((phase as Phase) !== "active") setPhase("active");
      }
      await request(false, completed);
      completed++;
      send("count", completed);
      if (
        plan.countSchedule &&
        completed < plan.measuredRequests &&
        completed % plan.countSchedule.requestsPerBurst === 0
      ) {
        setPhase("idle");
        await pause(plan.countSchedule.betweenMs);
        setPhase("active");
      }
      // Start the next eligible request immediately; only inter-window idle is scheduled.
    }
    activeEnd = now();
    send("active-end", activeEnd);
    reason =
      plan.mode === "timed"
        ? activeEnd - activeStart >= plan.activeLimitMs!
          ? "active-duration"
          : "request-safety-cap"
        : "request-count";
    if (reason === "request-safety-cap") {
      status = "failed";
      event(
        "failure",
        "Safety request cap reached before the configured active duration.",
      );
    }
    setPhase("idle");
    await pause(plan.idleMs);
  } catch (error) {
    status = stopReason ? stopStatus : "failed";
    reason = stopReason ?? String(error);
    if (activeStart !== null && activeEnd === null) {
      activeEnd = now();
      send("active-end", activeEnd);
    }
    event(
      status === "cancelled" || status === "interrupted" ? "cancel" : "failure",
      reason,
    );
    send("diagnostic", reason);
  } finally {
    setPhase("unload");
    if (engine) {
      try {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([
            engine.unload(),
            new Promise((_, reject) => {
              timeout = setTimeout(
                () => reject(Error("Unload exceeded 10 seconds")),
                10000,
              );
            }),
          ]);
          unloaded = true;
        } finally {
          clearTimeout(timeout);
        }
      } catch (e) {
        status = "failed";
        reason = `Unload failure: ${e}`;
        event("failure", reason);
        send("diagnostic", reason);
      }
      engine = undefined;
    } else unloaded = false;
    profiler.sample();
    setPhase("recovery");
    await pause(plan.recoveryMs, false);
    profiler.stop();
    const entries = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    send("network", {
      entries: entries.length,
      positiveTransferBytes: entries.some((e) => e.transferSize > 0)
        ? entries.reduce((s, e) => s + Math.max(0, e.transferSize), 0)
        : null,
      zeroOrHiddenEntries: entries.filter((e) => !e.transferSize).length,
      note: "Worker resource timings for this run. Positive transfer sizes are an observed lower bound only. Zero can mean cache or hidden cross-origin timing, not a verified zero-byte download.",
    });
    setPhase("finished");
    send("done", {
      status,
      reason,
      activeStartedMs: activeStart,
      activeEndedMs: activeEnd,
      completedRequests: completed,
      unloadConfirmed: unloaded,
      totalMs: now(),
    });
  }
}
