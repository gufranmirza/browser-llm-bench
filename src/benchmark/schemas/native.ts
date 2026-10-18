import { z } from "zod";
const n = z.number().finite().nonnegative();
const scalar = n.nullable();
export const nativeTraceSchema = z
  .object({
    version: z.literal("macos-native-trace-v1"),
    rootPid: n,
    logicalCpus: n,
    startedEpochMs: n,
    endedEpochMs: n,
    clockAlignment: z.object({
      method: z.string(),
      browserOffsetMs: z.number().finite(),
      maxNativeWallClockDriftMs: n,
      notes: z.string(),
    }),
    coverage: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        scope: z.string(),
        source: z.string(),
        unit: z.string(),
        status: z.enum(["available", "unavailable", "partial"]),
        reason: z.string(),
      }),
    ),
    points: z
      .array(
        z.object({
          tMs: z.number().finite(),
          epochMs: n,
          phase: z.string(),
          cpuOneCorePercent: scalar,
          cpuCapacityPercent: scalar,
          footprintBytes: scalar,
          rssSumBytes: scalar,
          processCount: n,
          incompleteCpuIntervals: n,
          hostGpuUtilizationPercent: scalar,
          hostGpuAllocatedBytes: scalar,
          hostSwapUsedBytes: scalar,
          hostMemoryPressureLevel: scalar,
          hostThermalState: scalar,
          collectorCostMs: n,
        }),
      )
      .max(2000),
    power: z
      .array(
        z.object({
          tMs: z.number().finite(),
          epochMs: n,
          intervalMs: n,
          cpuWatts: scalar,
          gpuWatts: scalar,
          aneWatts: scalar,
          combinedWatts: scalar,
        }),
      )
      .max(2000),
    // Separate interval series: GPU polling need not share the CPU cadence.
    // Optional for older reports, which must never acquire synthetic readings.
    gpu: z
      .array(
        z.object({
          tMs: z.number().finite(),
          startMs: z.number().finite().nullable(),
          epochMs: n,
          intervalMs: n.positive().nullable(),
          gpuTimeMs: scalar,
          clientCount: n.int(),
          collectionCostMs: n,
          issues: z.array(z.string()).max(30),
        }),
      )
      .max(2000)
      .optional(),
    gpuValidation: z
      .object({
        source: z.literal("Metal System Trace"),
        reportId: z.string(),
        targetPid: n.int(),
        counterMs: n,
        commandBufferEnvelopeMs: n,
        relativeDifference: n,
        correlation: z.number().finite().min(-1).max(1).nullable(),
        note: z.string(),
      })
      .optional(),
    energy: z.object({
      scope: z.string(),
      baselinePowerWatts: scalar,
      activeEnergyJoules: scalar,
      coveredActiveMs: n,
      activeAboveBaselineJoules: z.number().finite().nullable(),
      note: z.string(),
    }),
    provenance: z.record(z.string(), z.unknown()),
    rawSamples: z.array(z.record(z.string(), z.unknown())).max(2000),
    rawPower: z.array(z.record(z.string(), z.unknown())).max(2000),
    processes: z.array(z.record(z.string(), z.unknown())).max(500),
    processEvents: z.array(z.record(z.string(), z.unknown())).max(2000),
  })
  .superRefine((p, c) => {
    if (p.points.some((x, i) => i > 0 && x.epochMs < p.points[i - 1].epochMs))
      c.addIssue({
        code: "custom",
        message: "Native samples are not time ordered",
      });
    if (
      p.gpu?.some(
        (x, i, all) =>
          (i > 0 && x.tMs < all[i - 1].tMs) ||
          (x.startMs !== null && x.startMs >= x.tMs) ||
          (x.gpuTimeMs !== null &&
            (x.startMs === null ||
              x.intervalMs === null ||
              x.issues.length > 0)),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Invalid GPU interval or counter discontinuity",
      });
  });
export type NativeTrace = z.infer<typeof nativeTraceSchema>;
