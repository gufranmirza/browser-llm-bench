import { z } from "zod";
import { browserCapabilitiesSchema } from "../../features/capabilities/detect";
import live from "../runtime/catalog";
import { nativeTraceSchema } from "./native";
import { profileSchema } from "./profile";
export const MODEL = "SmolLM2-135M-Instruct-q0f16-MLC";
export const REVISION = "06fc409f2212adff29d93cbc742c1d6957302df5";
export const MODEL_URL = `https://huggingface.co/mlc-ai/${MODEL}/resolve/${REVISION}/`;
export const PROTOCOL = "fieldwork-browser-v1";
export const PROFILE_PROTOCOL = "browser-inference-bench-v2";
const n = z.number().finite().nonnegative();
export const sampleSchema = z.object({
  prompt: z.string().max(30000),
  output: z.string().max(100000),
  inputTokens: n.nullable(),
  outputTokens: n.nullable(),
  firstOutputMs: n.nullable(),
  responseMs: n,
  decodeTokensPerSecond: n.nullable(),
  finishReason: z.string(),
  valid: z.boolean(),
  warmup: z.boolean(),
  startedMs: n.optional(),
  endedMs: n.optional(),
  requestIndex: n.optional(),
});
export const reportSchema = z
  .object({
    schema: z.enum([
      "fieldwork-report-v1",
      "browser-inference-bench-report-v2",
    ]),
    id: z.string(),
    createdAt: z.string(),
    source: z.literal("local"),
    protocol: z.enum([PROTOCOL, PROFILE_PROTOCOL]),
    model: z
      .string()
      .refine(
        (id) => live.models.some((m) => m.id === id),
        "Unknown runnable artifact",
      ),
    revision: z.string().regex(/^[a-f0-9]{40}$/),
    modelUrl: z.string(),
    modelLib: z.string().optional(),
    quantization: z.enum(["q0f16", "q0f32", "q4f16_1", "q4f32_1"]),
    runtime: z.enum(["WebLLM 0.2.82", "WebLLM 0.2.86"]),
    executionBackend: z.literal("webgpu"),
    resourcePolicy: z.literal(
      "browser-managed; no dedicated resource reservation",
    ),
    workload: z.string(),
    status: z.enum([
      "complete",
      "failed",
      "cancelled",
      "unsupported",
      "interrupted",
    ]),
    environment: z.object({
      userAgent: z.string(),
      platform: z.string(),
      deviceLabel: z.string(),
      hardwareConcurrency: n,
      webgpu: z.boolean(),
      adapter: z.string().nullable(),
      browserCapabilities: browserCapabilitiesSchema.optional(),
    }),
    settings: z.object({
      thinkingMode: z
        .enum(["disabled", "enabled", "not-applicable"])
        .optional(),
      temperature: n,
      topP: n,
      maxTokens: n,
      contextWindow: n,
      warmups: n,
      warmupTokens: n.optional(),
      repeats: n,
      seed: n,
    }),
    cache: z.string(),
    loadMs: n.nullable(),
    firstPreparationMs: n.nullable(),
    downloadBytes: n.nullable(),
    downloadMs: n.nullable(),
    memory: z.object({
      jsHeapBytes: n.nullable(),
      gpuBytes: z.null(),
      note: z.string(),
    }),
    responsiveness: z.object({ maxEventLoopDelayMs: n, samples: n }),
    samples: z.array(sampleSchema).max(1005),
    diagnostics: z.array(z.string()).max(100),
    profile: profileSchema.optional(),
    nativeTrace: nativeTraceSchema.optional(),
  })
  .superRefine((r, ctx) => {
    const pin = live.models.find((m) => m.id === r.model);
    if (
      !pin ||
      r.revision !== pin.revision ||
      r.quantization !== pin.quantization ||
      r.modelUrl !== pin.modelUrl
    )
      ctx.addIssue({
        code: "custom",
        message: "Artifact pin does not match report",
      });
    if (pin && r.runtime !== pin.runtime)
      ctx.addIssue({
        code: "custom",
        message: "Runtime does not match the artifact runtime",
      });
    if (r.schema === "fieldwork-report-v1") {
      if (r.protocol !== PROTOCOL || r.samples.length > 20 || r.profile)
        ctx.addIssue({ code: "custom", message: "Invalid legacy report" });
    } else if (r.protocol !== PROFILE_PROTOCOL || !r.profile)
      ctx.addIssue({
        code: "custom",
        message: "V2 requires profiling metadata",
      });
    if (r.profile?.plan.countSchedule && r.status === "complete") {
      const p = r.profile;
      const phases = p.events.filter(
        (e) => e.type === "phase" && e.phase === "active",
      );
      const samples = r.samples.filter((s) => !s.warmup);
      if (
        phases.length !== 3 ||
        phases.some((e, i) => {
          const end = phases[i + 1]?.tMs ?? p.activeEndedMs ?? p.totalMs;
          return (
            samples.filter(
              (s) =>
                s.startedMs !== undefined &&
                s.startedMs >= e.tMs &&
                s.startedMs < end,
            ).length !== 20
          );
        }) ||
        [19, 39].some(
          (i) => samples[i + 1].startedMs! - samples[i].endedMs! < 90000,
        )
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Count session requires 3 windows of 20 responses and full 90-second gaps",
        });
    }
    if (r.profile && r.status === "complete") {
      const p = r.profile,
        measured = r.samples.filter((s) => !s.warmup);
      if (
        !p.unloadConfirmed ||
        measured.some((s) => !s.valid) ||
        measured.length !== p.completedRequests ||
        (p.plan.mode === "count" &&
          p.completedRequests !== p.plan.measuredRequests) ||
        (p.plan.mode === "timed" &&
          (p.activeStartedMs === null ||
            p.activeEndedMs === null ||
            p.activeEndedMs - p.activeStartedMs <
              (p.plan.activeLimitMs ?? Infinity)))
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Complete v2 report requires successful bounded measurements and unload",
        });
    }
    if (
      r.samples.some(
        (s) =>
          s.startedMs !== undefined &&
          s.endedMs !== undefined &&
          s.endedMs < s.startedMs,
      )
    )
      ctx.addIssue({ code: "custom", message: "Invalid request timestamps" });
  });
export type Report = z.infer<typeof reportSchema>;
export type Sample = z.infer<typeof sampleSchema>;
export function parseReports(value: unknown): Report[] {
  const items = Array.isArray(value) ? value : [value];
  return z.array(reportSchema).min(1).max(100).parse(items);
}
