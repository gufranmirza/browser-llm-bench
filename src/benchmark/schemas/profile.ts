import { z } from "zod";
const n = z.number().finite().nonnegative();
export const phaseNames = [
  "baseline",
  "load",
  "warmup",
  "active",
  "idle",
  "unload",
  "recovery",
  "finished",
] as const;
export const phaseSchema = z.enum(phaseNames);
export const profileSchema = z
  .object({
    enabled: z.boolean(),
    version: z.literal("browser-profile-v1"),
    startedEpochMs: n,
    clockCalibration: z
      .object({ wallEpochMs: n, performanceEpochMs: n })
      .optional(),
    sampleIntervalMs: z.literal(1000),
    plan: z.object({
      mode: z.enum(["count", "timed"]),
      measuredRequests: z.number().int().min(1).max(1000),
      activeLimitMs: z.union([
        z.literal(60000),
        z.literal(300000),
        z.literal(480000),
        z.null(),
      ]),
      totalLimitMs: z.union([z.literal(900000), z.literal(1800000)]),
      requestLimitMs: z.number().int().min(10000).max(600000),
      baselineMs: z.union([z.literal(2000), z.literal(15000)]),
      idleMs: z.union([z.literal(3000), z.literal(30000)]),
      recoveryMs: z.union([z.literal(2000), z.literal(15000)]),
      sessionSchedule: z
        .object({
          bursts: z.literal(3),
          burstMs: z.literal(40000),
          betweenMs: z.literal(90000),
          requestGapMs: z.union([z.literal(0), z.literal(4000)]),
        })
        .optional(),
      countSchedule: z
        .object({
          bursts: z.literal(3),
          requestsPerBurst: z.literal(20),
          betweenMs: z.literal(90000),
          requestGapMs: z.literal(0),
        })
        .optional(),
      resetPolicy: z.string(),
      finishInFlight: z.literal(true),
    }),
    points: z
      .array(
        z.object({
          tMs: n,
          scope: z.enum(["main", "worker"]),
          phase: phaseSchema,
          heapBytes: n.nullable(),
          wasmBytes: n.nullable(),
          gpuBufferBytes: n.nullable(),
          eventLoopDelayMs: n.nullable(),
          samplerCostMs: n,
        }),
      )
      .max(10000),
    events: z
      .array(
        z.object({
          tMs: n,
          type: z.enum([
            "phase",
            "visibility",
            "request-start",
            "request-end",
            "failure",
            "cancel",
            "device-lost",
            "device-destroyed",
            "forced-termination",
          ]),
          phase: phaseSchema,
          label: z.string().max(2000),
          requestIndex: n.optional(),
        }),
      )
      .max(6000),
    signals: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          scope: z.string(),
          source: z.string(),
          unit: z.string(),
          status: z.enum(["available", "unavailable", "disabled", "pending"]),
          reason: z.string().max(2000),
        }),
      )
      .max(30),
    pressure: z
      .array(
        z.object({
          tMs: n,
          state: z.enum(["nominal", "fair", "serious", "critical"]),
        }),
      )
      .max(2000),
    activeStartedMs: n.nullable(),
    activeEndedMs: n.nullable(),
    totalMs: n,
    completedRequests: n,
    stopReason: z.string(),
    unloadConfirmed: z.boolean(),
    overhead: z.object({
      mainCallbackMs: n,
      workerCallbackMs: n,
      mainCallbacks: n,
      workerCallbacks: n,
      mainMaxCallbackMs: n,
      workerMaxCallbackMs: n,
    }),
    network: z.object({
      entries: n,
      positiveTransferBytes: n.nullable(),
      zeroOrHiddenEntries: n,
      note: z.string(),
    }),
    artifact: z.object({
      manifestUrl: z.string(),
      manifestSha256: z.string(),
      weightShardBytes: n,
      shards: n,
      nominalParameters: n,
      theoreticalFP16Bytes: n,
    }),
  })
  .superRefine((p, c) => {
    const session = !!p.plan.sessionSchedule;
    const counted = !!p.plan.countSchedule;
    if (
      (counted &&
        (session ||
          p.plan.mode !== "count" ||
          p.plan.measuredRequests !== 60 ||
          p.plan.totalLimitMs !== 1800000)) ||
      (!counted && p.plan.totalLimitMs !== 900000)
    )
      c.addIssue({ code: "custom", message: "Invalid count-session protocol" });
    if (
      session !== (p.plan.activeLimitMs === 300000) ||
      ((session || counted) &&
        ((session && p.plan.mode !== "timed") ||
          p.plan.baselineMs !== 15000 ||
          p.plan.idleMs !== 30000 ||
          p.plan.recoveryMs !== 15000)) ||
      (!session &&
        !counted &&
        (p.plan.baselineMs !== 2000 ||
          p.plan.idleMs !== 3000 ||
          p.plan.recoveryMs !== 2000))
    )
      c.addIssue({
        code: "custom",
        message:
          "Session schedule and observation windows must match the selected protocol",
      });
    for (const scope of ["main", "worker"]) {
      const pts = p.points.filter((x) => x.scope === scope);
      if (pts.some((x, i) => i > 0 && x.tMs < pts[i - 1].tMs))
        c.addIssue({
          code: "custom",
          message: "Profile timestamps must be ordered per scope",
        });
    }
    if (
      p.activeStartedMs !== null &&
      p.activeEndedMs !== null &&
      p.activeEndedMs < p.activeStartedMs
    )
      c.addIssue({ code: "custom", message: "Invalid active interval" });
    if (
      p.plan.mode === "count" &&
      (p.plan.activeLimitMs !== null ||
        !(counted ? [60] : [1, 3, 10, 100]).includes(p.plan.measuredRequests))
    )
      c.addIssue({ code: "custom", message: "Invalid bounded count plan" });
    if (
      p.plan.mode === "timed" &&
      (![60000, 300000, 480000].includes(p.plan.activeLimitMs ?? 0) ||
        p.plan.measuredRequests !== 1000)
    )
      c.addIssue({
        code: "custom",
        message: "Timed plan must use a supported duration",
      });
  });
export type Profile = z.infer<typeof profileSchema>;
export type Phase = (typeof phaseNames)[number];
export type Point = Profile["points"][number];
export type ProfileEvent = Profile["events"][number];
export type Signal = Profile["signals"][number];
