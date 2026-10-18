import { workloadOptions } from "../../benchmark/protocol/workloads";
import live from "../../benchmark/runtime/catalog";
import type { Report, Sample } from "../../benchmark/schemas/report";
import { MODEL, MODEL_URL, REVISION } from "../../benchmark/schemas/report";
export type Model = {
  slug: string;
  name: string;
  family: string;
  parameters: number;
  color: string;
  card: string;
  description: string;
};
export const catalog: Model[] = [
  ...new Map(
    live.models.map((m) => [
      m.slug,
      {
        slug: m.slug,
        name: m.name,
        family: m.family,
        parameters: m.parameters,
        card: m.card,
        color: "#4e7269",
        description:
          "Pinned WebGPU artifact for reproducible browser benchmarking.",
      },
    ]),
  ).values(),
];
export const artifacts = live.models.map((m) => ({
  model_id: m.id,
  model: catalog.find((c) => c.slug === m.slug)!,
  model_lib: m.modelLib,
  vram_required_MB: m.estimatedVramMB ?? 0,
  low_resource_required: m.record?.low_resource_required ?? false,
  required_features: m.requiredFeatures,
  overrides: { ...m.record?.overrides, context_window_size: m.contextWindow },
  url: m.modelUrl,
  encoding: m.quantization,
  runnable: true,
}));
export type Artifact = (typeof artifacts)[number];
export const precision: Record<string, string> = {
  q0f16: "Unquantized FP16 weights",
  q0f32: "Unquantized FP32 weights",
  q4f16_1: "4-bit weights · FP16 compute",
  q4f32_1: "4-bit weights · FP32 compute",
};
export type CacheState = "absent" | "present" | "unknown";
export const cacheLabels: Record<CacheState, string> = {
  absent: "No weight cache detected",
  present: "Weight cache present",
  unknown: "Cache unknown",
};
export type Row = {
  id: string;
  artifact: Artifact;
  source: "illustrative" | "measured";
  cohort: string;
  device: string;
  gpu: string;
  browser: string;
  runtime: string;
  workload: string;
  protocol: string;
  cache: CacheState;
  status: string;
  revision: string | null;
  payloadBytes: number | null;
  loadMs: number | null;
  downloadMs: number | null;
  initMs: number | null;
  firstOutputMs: number | null;
  decode: number | null;
  responseMs: number | null;
  heapBytes: number | null;
  testedInput: number | null;
  inputTokens: number[];
  outputTokens: number[];
  samples: Sample[];
  attempts: number;
  completed: number;
  report?: Report;
};
export function observedCache(cache: string): CacheState {
  return cache.startsWith("No weight cache")
    ? "absent"
    : cache.startsWith("Weight cache present")
      ? "present"
      : "unknown";
}
export function browserLabel(agent: string) {
  const m =
    agent.match(/(Edg)\/([\d.]+)/) ?? agent.match(/(Firefox|Chrome)\/([\d.]+)/);
  if (m) return `${m[1] === "Edg" ? "Edge" : m[1]} ${m[2]}`;
  const safari = agent.match(/Version\/([\d.]+).*Safari/);
  return safari ? `Safari ${safari[1]}` : agent || "Browser not identified";
}
export function median(values: (number | null)[]) {
  const n = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  return n.length
    ? n.length % 2
      ? n[(n.length - 1) / 2]
      : (n[n.length / 2 - 1] + n[n.length / 2]) / 2
    : null;
}
export function reportRow(r: Report): Row {
  const a = artifacts.find((a) => a.model_id === r.model)!;
  const samples = r.samples.filter((s) => !s.warmup);
  const valid = samples.filter((s) => s.valid);
  const comparable = r.status === "complete" && r.workload !== "context";
  return {
    id: `run:${r.id}:${r.model}`,
    artifact: a,
    source: "measured",
    cohort: `run:${r.id}`,
    device: r.environment.deviceLabel,
    gpu:
      r.environment.adapter && r.environment.adapter !== "{}"
        ? r.environment.adapter
        : "Not recorded",
    browser: browserLabel(r.environment.userAgent),
    runtime: r.runtime,
    workload: r.workload,
    protocol: r.protocol,
    cache: observedCache(r.cache),
    status: r.status,
    revision: r.revision,
    payloadBytes: r.downloadBytes,
    loadMs: r.loadMs,
    downloadMs: r.downloadMs,
    initMs: null,
    firstOutputMs: comparable
      ? median(valid.map((s) => s.firstOutputMs))
      : null,
    decode: comparable
      ? median(valid.map((s) => s.decodeTokensPerSecond))
      : null,
    responseMs: comparable ? median(valid.map((s) => s.responseMs)) : null,
    heapBytes: r.memory.jsHeapBytes,
    testedInput: valid.some((s) => s.inputTokens !== null)
      ? Math.max(...valid.map((s) => s.inputTokens ?? 0))
      : null,
    inputTokens: samples.flatMap((s) =>
      s.inputTokens === null ? [] : [s.inputTokens],
    ),
    outputTokens: samples.flatMap((s) =>
      s.outputTokens === null ? [] : [s.outputTokens],
    ),
    samples,
    attempts: 1,
    completed: r.status === "complete" ? 1 : 0,
    report: r,
  };
}
export const workloadLabel = (id: string) =>
  workloadOptions.find((w) => w.id === id)?.name ?? id;
export const parameterLabel = (n: number) =>
  `${(n < 1 ? n * 1000 : n).toLocaleString(undefined, { maximumFractionDigits: 2 })}${n < 1 ? "M" : "B"}`;
export function tokenRange(values: number[]) {
  return !values.length
    ? "Unavailable"
    : Math.min(...values) === Math.max(...values)
      ? String(values[0])
      : `${Math.min(...values)}–${Math.max(...values)}`;
}
export const numberLabel = (n: number | null, unit = "", digits = 1) =>
  n === null
    ? "Unavailable"
    : `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? " " + unit : ""}`;
export const bytesLabel = (n: number | null) =>
  n === null
    ? "Unavailable"
    : n >= 1e9
      ? numberLabel(n / 1e9, "GB", 2)
      : numberLabel(n / 1e6, "MB", 1);
export const secondsLabel = (n: number | null) =>
  n === null ? "Unavailable" : numberLabel(n / 1000, "s", 2);
export type Metric =
  | "decode"
  | "firstOutputMs"
  | "responseMs"
  | "loadMs"
  | "payloadBytes"
  | "heapBytes"
  | "testedInput";
export const metricLabels: Record<Metric, string> = {
  decode: "Decode speed",
  firstOutputMs: "First output",
  responseMs: "Full response",
  loadMs: "Load → ready",
  payloadBytes: "Observed transfer",
  heapBytes: "JS heap estimate",
  testedInput: "Max tested input",
};
export function sortRows(
  rows: Row[],
  key: Metric | "name",
  descending: boolean,
) {
  return [...rows].sort((a, b) => {
    if (key === "name")
      return (
        a.artifact.model.name.localeCompare(b.artifact.model.name) *
        (descending ? -1 : 1)
      );
    const av = a[key],
      bv = b[key];
    if (av === null)
      return bv === null
        ? a.artifact.model.name.localeCompare(b.artifact.model.name)
        : 1;
    if (bv === null) return -1;
    return (
      (av - bv) * (descending ? -1 : 1) ||
      a.artifact.model.name.localeCompare(b.artifact.model.name)
    );
  });
}
export type Filters = {
  source: "illustrative" | "measured";
  search: string;
  family: string;
  size: string;
  quant: string;
  device: string;
  browser: string;
  runtime: string;
  workload: string;
  cache: string;
  cohort: string;
  untested: boolean;
};
export const defaultFilters: Filters = {
  source: "measured",
  search: "",
  family: "all",
  size: "all",
  quant: "all",
  device: "",
  browser: "",
  runtime: "",
  workload: "",
  cache: "",
  cohort: "",
  untested: false,
};
export function filterRows(rows: Row[], f: Filters) {
  return rows.filter(
    (r) =>
      r.source === f.source &&
      (f.family === "all" || r.artifact.model.family === f.family) &&
      (f.quant === "all" || r.artifact.encoding === f.quant) &&
      (f.size === "all" ||
        (f.size === "tiny"
          ? r.artifact.model.parameters < 1
          : f.size === "small"
            ? r.artifact.model.parameters >= 1 &&
              r.artifact.model.parameters < 2
            : r.artifact.model.parameters >= 2)) &&
      (!f.search ||
        `${r.artifact.model.name} ${r.artifact.model.family} ${r.artifact.model_id}`
          .toLowerCase()
          .includes(f.search.toLowerCase())) &&
      (!f.device || r.device === f.device) &&
      (!f.browser || r.browser === f.browser) &&
      (!f.runtime || r.runtime === f.runtime) &&
      (!f.workload || r.workload === f.workload) &&
      (!f.cache || r.cache === f.cache) &&
      (f.untested || r.status !== "untested"),
  );
}
// Never pool legacy reports: they lack a verified physical-device identity/session key.
export function inOneCohort(rows: Row[], requested: string) {
  const cohorts = [...new Set(rows.map((r) => r.cohort))];
  const cohort = cohorts.includes(requested) ? requested : (cohorts[0] ?? "");
  return { cohort, cohorts, rows: rows.filter((r) => r.cohort === cohort) };
}
export function evidenceUrl(row: Row) {
  return (
    row.report?.modelUrl ??
    (row.artifact.model_id === MODEL ? MODEL_URL : row.artifact.url)
  );
}
export { MODEL, REVISION };

export function primaryReportFor(
  reports: readonly Report[],
  artifactId: string,
): Report | undefined {
  const exact = reports
    .filter((r) => r.model === artifactId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  // Metal tracing adds substantial overhead. Keep the diagnostic selectable,
  // but prefer an ordinary completed run for the default performance result.
  const ordinary = exact.filter((r) => !r.nativeTrace?.gpuValidation);
  const preferred = ordinary.some((r) => r.status === "complete")
    ? ordinary
    : exact;
  return (
    preferred.find((r) => r.status === "complete" && r.profile?.enabled) ??
    preferred.find((r) => r.status === "complete") ??
    preferred[0]
  );
}

// Each artifact keeps one actual report; no averaging across sessions or devices.
export function primaryMeasuredRows(rows: readonly Row[]): Row[] {
  const measured = rows.filter((r) => r.source === "measured" && r.report);
  const reports = measured.map((r) => r.report!);
  return [...new Set(measured.map((r) => r.artifact.model_id))].flatMap(
    (id) => {
      const primary = primaryReportFor(reports, id);
      const row = measured.find((r) => r.report?.id === primary?.id);
      return row ? [row] : [];
    },
  );
}

export function measuredFilters(params: URLSearchParams): Filters {
  const result = { ...defaultFilters };
  const legacy =
    params.get("source") === "illustrative" ||
    params.get("cohort")?.startsWith("fixture:");
  if (!legacy) {
    for (const key of Object.keys(result) as (keyof Filters)[]) {
      if (
        key !== "source" &&
        key !== "untested" &&
        key !== "cohort" &&
        params.has(key)
      ) {
        (result as unknown as Record<string, unknown>)[key] = params.get(key)!;
      }
    }
  }
  return result;
}
