"use client";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Download,
  Gauge,
  Info,
  MemoryStick,
  Moon,
  Search,
  Timer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
} from "recharts";
import type { ResourceSummary } from "../../benchmark/metrics/resources";
import {
  comparisonKey,
  protocolLabel,
  summarizeResources,
} from "../../benchmark/metrics/resources";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SiteLink } from "../../components/SiteLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { ChartContainer, ChartTooltip } from "../../components/ui/chart";
import { Select } from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { navigate, replaceUrl } from "../../lib/urls";
import type { Filters, Row } from "./data";
import {
  defaultFilters,
  filterRows,
  measuredFilters,
  parameterLabel,
  primaryMeasuredRows,
  tokenRange,
} from "./data";

import { downloadJson } from "../../lib/download";
import "./leaderboard.css";

type Entry = { row: Row; resources: ResourceSummary };
type Key =
  | "decode"
  | "firstOutputMs"
  | "responseMs"
  | "peakMemory"
  | "idleMemory"
  | "releasedMemory"
  | "cpu"
  | "gpuTime"
  | "power";
const specs: Record<
  Key,
  { label: string; unit: string; note: string; color: string }
> = {
  decode: {
    label: "Generation speed",
    unit: "tok/s",
    note: "Median runtime-reported decode speed. Tokenizers differ across models.",
    color: "#347767",
  },
  firstOutputMs: {
    label: "First-output latency",
    unit: "ms",
    note: "Median time from request dispatch to first output in the worker, before page painting.",
    color: "#507fc2",
  },
  responseMs: {
    label: "Response time",
    unit: "s",
    note: "Median actual request duration. Output lengths differ; see the token counts in the table.",
    color: "#7567ab",
  },
  peakMemory: {
    label: "Peak browser memory",
    unit: "GB",
    note: "Sampled maximum over the full session, including loading. Sum of accounted Chrome process footprints, not deduplicated RAM.",
    color: "#7567ab",
  },
  idleMemory: {
    label: "Loaded-idle memory",
    unit: "GB",
    note: "Median Chrome footprint during the final loaded-idle observation, after the last request window.",
    color: "#7567ab",
  },
  releasedMemory: {
    label: "After-unload memory",
    unit: "GB",
    note: "Median Chrome footprint in the observation after unload. The browser remains open.",
    color: "#7567ab",
  },
  cpu: {
    label: "CPU capacity",
    unit: "%",
    note: "Time-weighted average over observed intervals wholly inside the request windows. Idle gaps excluded; 100% is all logical CPUs.",
    color: "#507fc2",
  },
  gpuTime: {
    label: "Chrome GPU time",
    unit: "ms/s",
    note: "Experimental driver-accounted Chrome GPU time during request windows. Includes rendering; not GPU utilization or reserved cores.",
    color: "#2d9189",
  },
  power: {
    label: "Host power",
    unit: "W",
    note: "Average observed CPU + GPU + ANE power during request windows. Whole-machine subsystem power, not model-only or wall-plug power.",
    color: "#b88338",
  },
};
const name = (r: Row) =>
  r.artifact.model.name.replace(/-Instruct$/, "").replace(/-/g, " ");
const href = (r: Row, back: string) =>
  `/models/${r.artifact.model.slug}?${new URLSearchParams({ artifact: r.artifact.model_id, source: r.source, cohort: r.cohort, back })}`;
const value = (e: Entry, k: Key): number | null =>
  k === "responseMs"
    ? e.row.responseMs === null
      ? null
      : e.row.responseMs / 1000
    : k === "decode" || k === "firstOutputMs"
      ? e.row[k]
      : e.resources[k];
const number = (n: number | null, k: Key) =>
  n === null
    ? "—"
    : n.toLocaleString(undefined, {
        maximumFractionDigits: [
          "peakMemory",
          "idleMemory",
          "releasedMemory",
          "responseMs",
        ].includes(k)
          ? 2
          : 1,
      });
const coverage = (e: Entry, k: Key) =>
  k === "cpu"
    ? e.resources.cpuCoverage
    : k === "gpuTime"
      ? e.resources.gpuCoverage
      : k === "power"
        ? e.resources.powerCoverage
        : null;
function stableId(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
const params = () =>
  new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search.slice(1),
  );
function chartTooltip(
  {
    active,
    payload,
  }: {
    active?: boolean;
    payload?: readonly {
      payload?: {
        name: string;
        value?: number;
        memory?: number;
        speed?: number;
        coverage?: number | null;
      };
      value?: unknown;
    }[];
  },
  metric?: Key,
) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="lb-tooltip">
      <strong>{p.name}</strong>
      {metric ? (
        <>
          <span>
            {number(p.value ?? null, metric)} {specs[metric].unit}
          </span>
          {p.coverage != null && (
            <small>
              {(p.coverage * 100).toFixed(1)}% of request-window time observed
            </small>
          )}
        </>
      ) : (
        <>
          <span>{p.memory?.toFixed(2)} GB peak browser memory</span>
          <span>{p.speed?.toFixed(1)} tok/s generation</span>
        </>
      )}
    </div>
  );
}
const faqs = [
  [
    "Will these results match my computer?",
    "Results describe the selected hardware, browser and runtime. A different device, browser version, power condition, or competing application can change performance. The leaderboard groups matching protocols and environments; each report includes the full configuration.",
  ],
  [
    "What is the difference between speed, latency and response time?",
    "First-output latency is the wait until the worker produces its first output. Generation speed measures decoding in tokens per second. Response time is the full measured request duration. All three are medians excluding warmup; response time depends on actual output length.",
  ],
  [
    "How are the 60 requests scheduled?",
    "One model is loaded and warmed up once. We send 20 requests sequentially, immediately starting the next after completion, then leave the model loaded for 90 seconds. We repeat this for three windows: 60 measured requests total. The three windows share one session; they are not independent trials. Older timed runs remain available under Saved reports.",
  ],
  [
    "What does browser memory include?",
    "The native collector sums the accounted footprint of dedicated Chrome and its helper processes. Peak covers the full session. Loaded-idle is the final observation before unload; after-unload is a separate observation. These are browser-process measurements, not model weight size, and are not deduplicated physical RAM.",
  ],
  [
    "What do CPU, GPU and power measure?",
    "CPU is the dedicated Chrome process tree’s average share of logical CPU capacity. GPU time is an experimental driver counter attributed to Chrome, including rendering; it is not GPU utilization. Power is whole-host CPU, GPU and ANE subsystem power. These averages use complete observed intervals inside request windows and exclude the long idle gaps. Coverage is shown with each value.",
  ],
  [
    "Does a faster model give better answers?",
    "These runs measure performance and resources using a repeated prompt. A completed request is not an accuracy check. Task quality and browser-suitability scoring are planned; neither an intelligence index nor an overall score is assigned here.",
  ],
  [
    "Why are some measurements unavailable?",
    "A dash means the report did not capture usable data for that metric. Missing samples are never replaced with zero. Partial interval coverage is reported, and values with missing data should not be treated as complete-window measurements.",
  ],
];

export default function LeaderboardPage({ allRows }: { allRows: Row[] }) {
  const [filters, setFilters] = useState<Filters>(() =>
    measuredFilters(params()),
  );
  useEffect(() => {
    const sync = () => setFilters(measuredFilters(params()));
    window.addEventListener("popstate", sync);
    const frame = requestAnimationFrame(() => {
      if (params().get("section") === "faq") {
        document
          .getElementById("leaderboard-faq")
          ?.scrollIntoView({ block: "start" });
      }
    });
    return () => {
      window.removeEventListener("popstate", sync);
      cancelAnimationFrame(frame);
    };
  }, []);
  const [sort, setSort] = useState<Key | "name">("decode"),
    [descending, setDescending] = useState(true);
  const [view, setView] = useState("overview"),
    [metric, setMetric] = useState<Key>("decode");
  const source = useMemo(
    () => allRows.filter((r) => r.source === "measured" && r.report),
    [allRows],
  );
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of source) {
      const k = comparisonKey(r);
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map]
      .map(([key, rs]) => ({
        id: stableId(key),
        rows: rs,
      }))
      .sort(
        (a, b) =>
          Number(!!b.rows[0].report?.profile?.plan.countSchedule) -
            Number(!!a.rows[0].report?.profile?.plan.countSchedule) ||
          b.rows.length - a.rows.length,
      );
  }, [source]);
  const selected = groups[0];
  const entries = useMemo(
    () =>
      primaryMeasuredRows(filterRows(selected?.rows ?? [], filters)).map(
        (row) => ({ row, resources: summarizeResources(row.report) }),
      ),
    [selected, filters],
  );
  const rows = [...entries].sort((a, b) => {
    if (sort === "name")
      return name(a.row).localeCompare(name(b.row)) * (descending ? -1 : 1);
    const av = value(a, sort),
      bv = value(b, sort);
    if (av === null) return bv === null ? 0 : 1;
    if (bv === null) return -1;
    return (av - bv) * (descending ? -1 : 1);
  });
  const query = new URLSearchParams(
    Object.entries(filters)
      .filter(([k]) => k !== "untested" && k !== "cohort")
      .map(([k, v]) => [k, String(v)]),
  );
  if (params().get("section") === "faq") query.set("section", "faq");
  const back = `/?${query}`;
  const faqQuery = new URLSearchParams(query);
  faqQuery.set("section", "faq");
  useEffect(() => {
    replaceUrl(back);
  }, [back]);
  function update(k: "search" | "family" | "size" | "quant", v: string) {
    setFilters((f) => ({ ...f, [k]: v, cohort: "" }));
  }
  function reset() {
    setFilters({ ...defaultFilters });
  }
  function changeSort(k: Key | "name") {
    if (sort === k) setDescending(!descending);
    else {
      setSort(k);
      setDescending(k === "decode");
    }
  }
  function head(k: Key | "name", label: string, unit?: string) {
    return (
      <TableHead
        key={k}
        aria-sort={
          sort === k ? (descending ? "descending" : "ascending") : "none"
        }
      >
        <button onClick={() => changeSort(k)}>
          {label}
          {sort === k ? (
            descending ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUp size={12} />
            )
          ) : (
            <ArrowUpDown size={12} />
          )}
        </button>
        {unit && <small>{unit}</small>}
      </TableHead>
    );
  }
  const keys: Key[] =
    view === "resources"
      ? [
          "peakMemory",
          "idleMemory",
          "releasedMemory",
          "cpu",
          "gpuTime",
          "power",
        ]
      : ["decode", "firstOutputMs", "responseMs", "peakMemory", "cpu"];
  const filtered =
    filters.search ||
    filters.family !== "all" ||
    filters.size !== "all" ||
    filters.quant !== "all" ||
    filters.device ||
    filters.browser ||
    filters.runtime ||
    filters.workload ||
    filters.cache;
  const highlights: [Key, string, typeof Gauge][] = [
    ["decode", "Generation speed", Gauge],
    ["firstOutputMs", "Latency", Timer],
    ["peakMemory", "Browser memory", MemoryStick],
    ["idleMemory", "Loaded idle", Moon],
  ];
  const eligible = entries.filter((e) => e.row.status === "complete");
  const chartRows = eligible
    .filter((e) => value(e, metric) !== null)
    .sort(
      (a, b) =>
        (value(a, metric)! - value(b, metric)!) *
        (metric === "decode" ? -1 : 1),
    );
  const chartData = chartRows.map((e) => ({
    name: `${name(e.row)} · ${e.row.artifact.encoding}`,
    value: value(e, metric),
    coverage: coverage(e, metric),
    url: href(e.row, back),
  }));
  const scatter = eligible
    .filter((e) => e.resources.peakMemory !== null && e.row.decode !== null)
    .map((e) => ({
      name: name(e.row),
      memory: e.resources.peakMemory!,
      speed: e.row.decode!,
      url: href(e.row, back),
    }));
  return (
    <div className="lb-page">
      <section className="lb-intro">
        <div className="lb-intro-top">
          <div className="lb-intro-title">
            <h1>Browser Model Leaderboard — comparison of local AI models</h1>
            <div className="lb-intro-actions">
              <SiteLink className="lb-intro-primary" href="/methodology/">
                Methodology <ArrowUpRight size={14} />
              </SiteLink>
              <button
                disabled={!entries.length}
                onClick={() =>
                  downloadJson(
                    entries.map((e) => e.row.report),
                    "browser-bench-results.json",
                  )
                }
              >
                Download results <Download size={14} />
              </button>
            </div>
          </div>
          <div className="lb-intro-copy">
            <p>
              Compare open models running locally in the browser across
              generation speed, first-output latency, response time, and CPU,
              GPU and memory usage.
            </p>
            <p>
              Results come from saved benchmark runs. Task quality is not
              evaluated yet. For measurement definitions and comparison notes,
              see our{" "}
              <SiteLink
                href={`/?${faqQuery}`}
                onClick={(e) => {
                  e.preventDefault();
                  const next = new URLSearchParams(query);
                  next.set("section", "faq");
                  replaceUrl(`/?${next}`);
                  document
                    .getElementById("leaderboard-faq")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                FAQs
              </SiteLink>
              .
            </p>
          </div>
        </div>
        <div className="lb-insights">
          {highlights.map(([k, label]) => {
            const ranked = eligible
              .filter((e) => value(e, k) !== null)
              .sort(
                (a, b) =>
                  (value(a, k)! - value(b, k)!) * (k === "decode" ? -1 : 1),
              );
            const best = ranked[0],
              second = ranked[1];
            const descriptions: Partial<Record<Key, string>> = {
              decode: "has the fastest generation",
              firstOutputMs: "has the lowest first-output latency",
              peakMemory: "has the lowest sampled peak browser memory",
              idleMemory: "has the lowest loaded-idle browser memory",
            };
            return (
              <Card className="lb-insight" key={k}>
                <h2>{label}</h2>
                {best ? (
                  <p>
                    <SiteLink href={href(best.row, back)}>
                      {name(best.row)}
                    </SiteLink>{" "}
                    {descriptions[k]} at{" "}
                    <strong>
                      {number(value(best, k), k)} {specs[k].unit}
                    </strong>
                    {second ? (
                      <>
                        , followed by{" "}
                        <SiteLink href={href(second.row, back)}>
                          {name(second.row)}
                        </SiteLink>{" "}
                        at {number(value(second, k), k)} {specs[k].unit}.
                      </>
                    ) : (
                      "."
                    )}
                  </p>
                ) : (
                  <p>No measurement available for this selection.</p>
                )}
                <div className="lb-insight-logos">
                  {ranked.slice(0, 3).map((e) => (
                    <SiteLink
                      key={e.row.id}
                      href={href(e.row, back)}
                      aria-label={`View ${name(e.row)} ${label.toLowerCase()}`}
                      title={name(e.row)}
                    >
                      <ProviderLogo
                        family={e.row.artifact.model.family}
                        model={e.row.artifact.model.name}
                      />
                    </SiteLink>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </section>
      <section aria-label="Model comparison">
        <div className="lb-section-heading">
          <div>
            <h2>Compare models</h2>
            <p>
              {entries.length} configurations ·{" "}
              {selected
                ? protocolLabel(selected.rows[0])
                : "saved measurements"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={!entries.length}
            onClick={() =>
              downloadJson(
                entries.map((e) => e.row.report),
                "browser-bench-results.json",
              )
            }
          >
            <Download size={14} />
            Download results
          </Button>
        </div>
        <div className="lb-controls">
          <label className="lb-search">
            <Search size={16} />
            <input
              aria-label="Search models and creators"
              placeholder="Search models or creators…"
              value={filters.search}
              onChange={(e) => update("search", e.target.value)}
            />
          </label>
          <Select
            label="Creator"
            value={filters.family}
            onValueChange={(v) => update("family", v)}
            options={[
              { value: "all", label: "All creators" },
              ...[
                ...new Set(selected?.rows.map((r) => r.artifact.model.family)),
              ].map((v) => ({ value: v, label: v })),
            ]}
          />
          <Select
            label="Model size"
            value={filters.size}
            onValueChange={(v) => update("size", v)}
            options={[
              { value: "all", label: "All sizes" },
              { value: "tiny", label: "Under 1B" },
              { value: "small", label: "1B–2B" },
              { value: "larger", label: "2B and above" },
            ]}
          />
          <Select
            label="Encoding"
            value={filters.quant}
            onValueChange={(v) => update("quant", v)}
            options={[
              { value: "all", label: "All encodings" },
              ...[
                ...new Set(selected?.rows.map((r) => r.artifact.encoding)),
              ].map((v) => ({ value: v, label: v })),
            ]}
          />
          {!!filtered && (
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset filters
            </Button>
          )}
        </div>
        <div className="lb-table-toolbar">
          <Tabs value={view} onValueChange={setView}>
            <TabsList aria-label="Table columns">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
            </TabsList>
          </Tabs>
          <span>
            Sorted by{" "}
            {sort === "name" ? "model name" : specs[sort].label.toLowerCase()}{" "}
            {descending ? "↓" : "↑"}
          </span>
        </div>
        {rows.length ? (
          <Card className="lb-table">
            <Table aria-label="Browser model leaderboard">
              <TableHeader>
                <TableRow>
                  {head("name", "Model")}
                  <TableHead>Creator</TableHead>
                  {keys.map((k) =>
                    head(
                      k,
                      k === "firstOutputMs"
                        ? "Latency"
                        : k === "peakMemory"
                          ? "Peak memory"
                          : k === "idleMemory"
                            ? "Loaded idle"
                            : k === "releasedMemory"
                              ? "After unload"
                              : k === "decode"
                                ? "Speed"
                                : specs[k].label,
                      specs[k].unit +
                        (k === "decode"
                          ? " ↑"
                          : k === "gpuTime" || k === "cpu" || k === "power"
                            ? ""
                            : " ↓"),
                    ),
                  )}
                  <TableHead>
                    Requests<small>completed / scheduled</small>
                  </TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow key={e.row.id}>
                    <TableCell>
                      <SiteLink className="lb-model" href={href(e.row, back)}>
                        <ProviderLogo
                          family={e.row.artifact.model.family}
                          model={e.row.artifact.model.name}
                        />
                        <span>
                          <strong>{name(e.row)}</strong>
                          <small>
                            {parameterLabel(e.row.artifact.model.parameters)} ·{" "}
                            {e.row.artifact.encoding}
                          </small>
                        </span>
                      </SiteLink>
                    </TableCell>
                    <TableCell>
                      <span className="lb-creator">
                        <ProviderLogo family={e.row.artifact.model.family} />
                        {e.row.artifact.model.family}
                      </span>
                    </TableCell>
                    {keys.map((k) => (
                      <TableCell
                        key={k}
                        className={k === sort ? "lb-sorted" : ""}
                        title={specs[k].note}
                      >
                        <span>{number(value(e, k), k)}</span>
                        {coverage(e, k) !== null && value(e, k) !== null && (
                          <small>
                            {(coverage(e, k)! * 100).toFixed(0)}% observed
                          </small>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      {e.row.samples.filter((s) => !s.warmup && s.valid).length}
                      {e.row.report?.profile?.plan.mode === "count" ? (
                        ` / ${e.row.report.profile.plan.measuredRequests}`
                      ) : (
                        <small>timed run</small>
                      )}
                      <small>
                        {tokenRange(e.row.outputTokens)} output tokens
                      </small>
                      {e.row.status !== "complete" && (
                        <small>{e.row.status}</small>
                      )}
                    </TableCell>
                    <TableCell>
                      <SiteLink
                        className="lb-report-link"
                        href={href(e.row, back)}
                        aria-label={`View ${name(e.row)} report`}
                      >
                        <ArrowUpRight size={17} />
                      </SiteLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="lb-table-note">
              <Info size={14} />
              <span>
                {view === "resources"
                  ? "Memory is browser-process footprint. CPU, GPU time and host power use observed request-window intervals, excluding idle gaps. GPU time is experimental."
                  : "Request metrics are medians, excluding warmup. Peak memory covers the full session; CPU covers observed request-window intervals."}{" "}
                Output lengths vary.{" "}
                <SiteLink href="/methodology/">
                  Measurement definitions
                </SiteLink>
              </span>
            </div>
          </Card>
        ) : (
          <Card className="lb-empty">
            <Search size={24} />
            <h3>No matching results</h3>
            <p>Try another model name or reset the filters.</p>
            <Button variant="outline" onClick={reset}>
              Reset filters
            </Button>
          </Card>
        )}
      </section>
      <section className="lb-comparison" aria-label="Comparison charts">
        <div className="lb-section-heading">
          <div>
            <h2>Performance and footprint</h2>
            <p>
              Same setup and filters as the table. Select a data point to open
              its report.
            </p>
          </div>
        </div>
        <div className="lb-chart-grid">
          <Card className="lb-chart">
            <div className="lb-chart-heading">
              <h3>Speed versus memory</h3>
              <span>Higher speed · lower footprint</span>
            </div>
            <p>
              Measured generation speed against sampled peak browser memory.
            </p>
            <ChartContainer
              config={{
                speed: { label: "Generation speed", color: "#347767" },
              }}
              style={{ height: 360 }}
            >
              <ScatterChart
                accessibilityLayer
                margin={{ top: 20, right: 25, bottom: 30, left: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="memory"
                  name="Peak browser memory"
                  unit=" GB"
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: "Peak browser memory (GB)",
                    position: "bottom",
                    offset: 12,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="speed"
                  name="Generation speed"
                  unit=" tok/s"
                  width={72}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip
                  cursor={{ strokeDasharray: "3 3" }}
                  content={(props) => chartTooltip(props)}
                />
                <Scatter
                  data={scatter}
                  fill="var(--color-speed)"
                  isAnimationActive={false}
                  onClick={(p) => {
                    if (p.payload?.url) navigate(p.payload.url);
                  }}
                />
              </ScatterChart>
            </ChartContainer>
            {!scatter.length && (
              <p>No paired speed and memory measurements available.</p>
            )}
            <details className="lb-chart-values">
              <summary>View plotted models</summary>
              {scatter.map((p) => (
                <SiteLink key={p.url} href={p.url}>
                  {p.name}
                  <span>
                    {p.speed.toFixed(1)} tok/s · {p.memory.toFixed(2)} GB
                  </span>
                </SiteLink>
              ))}
            </details>
          </Card>
          <Card className="lb-chart">
            <div className="lb-chart-heading">
              <h3>Compare a metric</h3>
              <Select
                label="Chart metric"
                value={metric}
                onValueChange={(v) => setMetric(v as Key)}
                options={(Object.keys(specs) as Key[]).map((k) => ({
                  value: k,
                  label: specs[k].label,
                }))}
              />
            </div>
            <p>{specs[metric].note}</p>
            <ChartContainer
              config={{
                value: {
                  label: `${specs[metric].label} (${specs[metric].unit})`,
                  color: specs[metric].color,
                },
              }}
              style={{ height: 360 }}
            >
              <BarChart
                accessibilityLayer
                data={chartData}
                layout="vertical"
                margin={{ top: 8, right: 40, bottom: 12, left: 0 }}
              >
                <CartesianGrid horizontal={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={130}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tickFormatter={(v) => String(v).split(" · ")[0]}
                  tick={{ fontSize: 11 }}
                />
                <XAxis
                  type="number"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v} ${specs[metric].unit}`}
                />
                <ChartTooltip
                  cursor={false}
                  content={(props) => chartTooltip(props, metric)}
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                  onClick={(p) => {
                    if (p.payload?.url) navigate(p.payload.url);
                  }}
                >
                  <LabelList
                    dataKey="value"
                    position="right"
                    fontSize={11}
                    fill="currentColor"
                    formatter={(v) =>
                      Number(v).toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })
                    }
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
            {!chartData.length && (
              <p>No measurements available for this metric.</p>
            )}
            <details className="lb-chart-values">
              <summary>View values and reports</summary>
              {chartData.map((p) => (
                <SiteLink key={p.url} href={p.url}>
                  {p.name}
                  <span>
                    {number(p.value, metric)} {specs[metric].unit}
                  </span>
                </SiteLink>
              ))}
            </details>
          </Card>
        </div>
      </section>
      <section id="leaderboard-faq" className="lb-faq">
        <div>
          <span className="section-kicker">UNDERSTANDING THE RESULTS</span>
          <h2>Frequently asked questions</h2>
          <p>The context behind the numbers.</p>
          <SiteLink href="/methodology/">
            Read the methodology <ArrowUpRight size={14} />
          </SiteLink>
        </div>
        <Accordion type="single" collapsible>
          {faqs.map(([q, a], i) => (
            <AccordionItem key={q} value={String(i)}>
              <AccordionTrigger>{q}</AccordionTrigger>
              <AccordionContent>
                <p>{a}</p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </div>
  );
}
