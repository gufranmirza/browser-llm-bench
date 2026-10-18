import type { NativeTrace } from "../schemas/native";
import type { Phase, Profile } from "../schemas/profile";

export const phaseLabels: Record<Phase, string> = {
  baseline: "Baseline",
  load: "Model loading",
  warmup: "Warmup",
  active: "Inference",
  idle: "Post-run idle",
  unload: "Unload",
  recovery: "Recovery",
  finished: "Stopped",
};
export const phaseColor = (phase: Phase) =>
  phase === "active"
    ? "var(--chart-phase-active)"
    : phase === "warmup"
      ? "var(--chart-phase-warmup)"
      : "var(--chart-phase-idle)";

export function timelineWindow(profile: Profile, live = false) {
  // Saved stop time is authoritative. Late worker messages do not extend a run.
  const endMs = live
    ? Math.max(
        profile.totalMs,
        ...profile.points.map((p) => p.tMs),
        ...profile.events.map((e) => e.tMs),
        1,
      )
    : Math.max(profile.totalMs, 1);
  const end = endMs / 1000;
  const step = 10 ** Math.floor(Math.log10(end));
  const spacing = end / step < 2 ? step / 5 : end / step < 5 ? step / 2 : step;
  const ticks = [0];
  for (let t = spacing; t < end - spacing * 0.35; t += spacing) ticks.push(t);
  ticks.push(end);
  const events = profile.events
    .filter((e) => e.type === "phase" && e.phase !== "finished")
    .filter((e, i, a) => !i || a[i - 1].phase !== e.phase);
  const phases = events
    .map((e, i) => ({
      phase: e.phase,
      startMs: Math.max(0, e.tMs),
      endMs: Math.min(endMs, events[i + 1]?.tMs ?? endMs),
    }))
    .filter((p) => p.startMs < p.endMs);
  return { end, endMs, ticks, phases };
}

export function withinRun<T extends { tMs: number }>(
  points: T[],
  endMs: number,
): T[] {
  return points.filter((p) => p.tMs >= 0 && p.tMs <= endMs);
}

export function nativeRunPoints(trace: NativeTrace, endMs: number) {
  return withinRun(
    trace.points.map((point, i, all) => ({
      ...point,
      // CPU is an interval average. Do not display one crossing the run start.
      cpuOneCorePercent:
        i > 0 && all[i - 1].tMs >= 0 ? point.cpuOneCorePercent : null,
    })),
    endMs,
  );
}

export function powerRunPoints(trace: NativeTrace, endMs: number) {
  return withinRun(trace.power, endMs).map((p) =>
    p.tMs - p.intervalMs >= 0
      ? p
      : {
          ...p,
          cpuWatts: null,
          gpuWatts: null,
          aneWatts: null,
          combinedWatts: null,
        },
  );
}

export const secondsLabel = (seconds: number) =>
  `${Number(seconds.toFixed(2))}s`;
export function phaseAt(profile: Profile, tMs: number) {
  return (
    [...profile.events]
      .reverse()
      .find((e) => e.type === "phase" && e.tMs <= tMs)?.phase ?? "baseline"
  );
}
