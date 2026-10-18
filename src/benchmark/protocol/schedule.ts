export type RepeatMode =
  | "smoke"
  | "standard"
  | "extended"
  | "minute"
  | "timed"
  | "session"
  | "session-count";
export const SAMPLE_INTERVAL_MS = 1000;
export const BASELINE_MS = 2000;
export const IDLE_MS = 3000;
export const RECOVERY_MS = 2000;
export const ACTIVE_MS = 480000;
export const MINUTE_ACTIVE_MS = 60000;
export const TOTAL_LIMIT_MS = 900000;
export const REQUEST_LIMIT_MS = 60000;
export const MAX_REQUESTS = 1000;
export function planFor(
  workload: string,
  mode: RepeatMode = "standard",
  options: { requestLimitMs?: number; seed?: number } = {},
) {
  const counted = workload === "repeat" && mode === "session-count";
  const session = workload === "repeat" && mode === "session";
  const timed =
    workload === "repeat" && (mode === "timed" || mode === "minute" || session);
  return {
    mode: timed ? ("timed" as const) : ("count" as const),
    measuredRequests:
      workload === "repeat"
        ? {
            smoke: 3,
            standard: 10,
            extended: 100,
            minute: MAX_REQUESTS,
            timed: MAX_REQUESTS,
            session: MAX_REQUESTS,
            "session-count": 60,
          }[mode]
        : workload === "context"
          ? 3
          : 1,
    activeLimitMs: session
      ? 300000
      : timed
        ? mode === "minute"
          ? MINUTE_ACTIVE_MS
          : ACTIVE_MS
        : null,
    totalLimitMs: counted ? 1800000 : TOTAL_LIMIT_MS,
    requestLimitMs: options.requestLimitMs ?? REQUEST_LIMIT_MS,
    baselineMs: session || counted ? 15000 : BASELINE_MS,
    idleMs: session || counted ? 30000 : IDLE_MS,
    recoveryMs: session || counted ? 15000 : RECOVERY_MS,
    sessionSchedule: session
      ? ({
          bursts: 3,
          burstMs: 40000,
          betweenMs: 90000,
          requestGapMs: 0,
        } as const)
      : undefined,
    countSchedule: counted
      ? ({
          bursts: 3,
          requestsPerBurst: 20,
          betweenMs: 90000,
          requestGapMs: 0,
        } as const)
      : undefined,
    resetPolicy: `resetChat before every request; fixed prompt for repeats; seed ${options.seed ?? 42}`,
    finishInFlight: true,
  } as const;
}
export type RunPlan = ReturnType<typeof planFor>;
export function shouldStartRequest(
  plan: RunPlan,
  completed: number,
  elapsedMs: number,
) {
  return (
    completed < plan.measuredRequests &&
    (plan.activeLimitMs === null || elapsedMs < plan.activeLimitMs)
  );
}
export function durationLabel(ms: number) {
  return `${Math.floor(ms / 60000)}:${Math.floor(ms / 1000) % 60 < 10 ? "0" : ""}${Math.floor(ms / 1000) % 60}`;
}
export function distribution(values: (number | null)[]) {
  const n = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  return {
    count: n.length,
    min: n[0] ?? null,
    max: n.at(-1) ?? null,
    median: n.length
      ? (n[Math.floor((n.length - 1) / 2)] + n[Math.ceil((n.length - 1) / 2)]) /
        2
      : null,
  };
}

// Absolute session offsets prevent request duration from accumulating schedule drift.
export function sessionWindow(elapsedMs: number) {
  const burst = Math.floor(elapsedMs / 130000);
  const offset = elapsedMs - burst * 130000;
  return {
    burst,
    requesting: elapsedMs < 300000 && offset < 40000,
    nextBoundaryMs: Math.min(
      300000,
      burst * 130000 + (offset < 40000 ? 40000 : 130000),
    ),
  };
}
