import type { Sample } from "../schemas/report";

export type PerformanceMetric = "speed" | "latency" | "duration";
const finite = (value: number | null | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

// Keep gaps in the request trace; invalid output and warmup never enter summaries.
export function performanceRows(samples: Sample[]) {
  return samples
    .filter((s) => !s.warmup)
    .map((s, i) => {
      const duration =
        s.valid && finite(s.responseMs) ? s.responseMs / 1000 : null;
      const latency =
        s.valid && finite(s.firstOutputMs) ? s.firstOutputMs : null;
      const paired =
        duration !== null && latency !== null && latency / 1000 <= duration;
      return {
        request: s.requestIndex ?? i + 1,
        speed:
          s.valid && finite(s.decodeTokensPerSecond)
            ? s.decodeTokensPerSecond
            : null,
        latency,
        duration,
        wait: paired ? latency / 1000 : null,
        remaining: paired ? duration - latency / 1000 : null,
      };
    });
}
export function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export function distribution(values: number[]) {
  if (!values.length) return [];
  const min = Math.min(...values),
    max = Math.max(...values);
  if (min === max) return [{ lower: min, upper: max, count: values.length }];
  const size = Math.min(12, Math.ceil(Math.sqrt(values.length)));
  const width = (max - min) / size;
  const bins = Array.from({ length: size }, (_, i) => ({
    lower: min + i * width,
    upper: i === size - 1 ? max : min + (i + 1) * width,
    count: 0,
  }));
  for (const value of values)
    bins[Math.min(size - 1, Math.floor((value - min) / width))].count++;
  return bins;
}
