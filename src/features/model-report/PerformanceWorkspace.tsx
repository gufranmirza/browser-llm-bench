"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  distribution,
  percentile,
  performanceRows,
  type PerformanceMetric,
} from "../../benchmark/metrics/performance";
import type { Sample } from "../../benchmark/schemas/report";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../../components/ui/chart";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";

const metrics = [
  {
    key: "latency",
    title: "First-output latency",
    unit: "ms",
    color: "#2563eb",
    direction: "Lower is faster",
    note: "From the worker starting the request to the first nonempty text chunk. This is not the time text appears on screen.",
  },
  {
    key: "speed",
    title: "Generation speed",
    unit: "tok/s",
    color: "#0d9488",
    direction: "Higher is faster",
    note: "Decode throughput reported by the runtime. Uses its token accounting, not total response time divided by tokens.",
  },
  {
    key: "duration",
    title: "End-to-end response time",
    unit: "s",
    color: "#7c3aed",
    direction: "Lower is faster",
    note: "From the worker starting the request to the completed response stream. Excludes model loading, chat reset and UI rendering. Uses the actual response length.",
  },
] as const;
const format = (n: number | null, digits = 2) =>
  n === null
    ? "Unavailable"
    : n.toLocaleString(undefined, { maximumFractionDigits: digits });

function MetricSection({
  metric,
  rows,
}: {
  metric: (typeof metrics)[number];
  rows: ReturnType<typeof performanceRows>;
}) {
  const [view, setView] = useState("requests");
  const values = rows.flatMap((r) =>
    r[metric.key] === null ? [] : [r[metric.key] as number],
  );
  const bins = distribution(values).map((b) => ({
    ...b,
    range:
      b.lower === b.upper
        ? format(b.lower, 3)
        : `${format(b.lower, 3)}–${format(b.upper, 3)}`,
  }));
  const paired = rows.filter((r) => r.wait !== null).length;
  const config = {
    [metric.key]: {
      label: `${metric.title} (${metric.unit})`,
      color: metric.color,
    },
    count: { label: "Requests", color: metric.color },
    wait: { label: "First-output wait (s)", color: "#2563eb" },
    remaining: { label: "Remaining response (s)", color: "#7c3aed" },
  };
  const unit =
    view === "distribution" ? `Value range (${metric.unit})` : metric.unit;
  const xAxis = (
    <XAxis
      dataKey={view === "distribution" ? "range" : "request"}
      axisLine={false}
      tickLine={false}
      minTickGap={32}
      tick={{ fontSize: 10 }}
    />
  );
  const yAxis = (
    <YAxis
      width={52}
      axisLine={false}
      tickLine={false}
      allowDecimals={view !== "distribution"}
      domain={[0, "auto"]}
      tickFormatter={(v: number) => format(v)}
    />
  );
  const tooltip = (
    <ChartTooltip
      content={
        <ChartTooltipContent
          nameKey="dataKey"
          labelFormatter={(_, payload) =>
            view === "distribution"
              ? `${payload[0]?.payload?.range} ${metric.unit}`
              : `Request ${payload[0]?.payload?.request}`
          }
          formatter={(value, name) => (
            <div className="v2-tooltip-value">
              <span>
                {config[String(name) as keyof typeof config]?.label ?? name}
              </span>
              <strong>
                {typeof value === "number" ? format(value, 3) : String(value)}
              </strong>
            </div>
          )}
        />
      }
    />
  );
  return (
    <Card className="v2-performance-panel" id={`performance-${metric.key}`}>
      <CardHeader>
        <div className="v2-card-eyebrow">
          <span>{metric.direction}</span>
          <span>
            {values.length} / {rows.length} requests with usable values
          </span>
        </div>
        <div className="v2-metric-heading">
          <div>
            <CardTitle>
              <h3>{metric.title}</h3>
            </CardTitle>
            <CardDescription>
              Per-request measurements · warmup and invalid outputs excluded
            </CardDescription>
          </div>
          <div className="v2-metric-headline" style={{ color: metric.color }}>
            <strong>{format(percentile(values, 0.5))}</strong>
            {values.length > 0 && <span>{metric.unit}</span>}
            <small>Median</small>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={view} onValueChange={setView}>
          <TabsList aria-label={`${metric.title} views`}>
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
            {metric.key === "duration" && (
              <TabsTrigger value="breakdown">Timing breakdown</TabsTrigger>
            )}
          </TabsList>
          <TabsContent
            value={view}
            aria-label={`${metric.title}: ${view}`}
            className="v2-performance-plot"
          >
            <div className="v2-axis-caption">
              <span>{unit}</span>
              <span>
                {view === "distribution"
                  ? "Number of requests in each value range"
                  : "Each point is one request"}
              </span>
            </div>
            {values.length > 0 && (view !== "breakdown" || paired > 0) ? (
              <ChartContainer
                config={config}
                style={{ height: 260 }}
                aria-label={`${metric.title} ${view} chart`}
              >
                {view === "requests" ? (
                  <LineChart
                    accessibilityLayer
                    data={rows}
                    margin={{ top: 15, right: 14, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid vertical={false} />
                    {xAxis}
                    {yAxis}
                    {tooltip}
                    <Line
                      type="linear"
                      dataKey={metric.key}
                      stroke={metric.color}
                      strokeWidth={2}
                      dot={rows.length < 3}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                ) : (
                  <BarChart<(typeof bins)[number] | (typeof rows)[number]>
                    accessibilityLayer
                    data={view === "distribution" ? bins : rows}
                    layout={view === "distribution" ? "vertical" : "horizontal"}
                    margin={{ top: 15, right: 14, left: 0, bottom: 5 }}
                    barCategoryGap={view === "distribution" ? "8%" : "15%"}
                  >
                    <CartesianGrid
                      vertical={view === "distribution"}
                      horizontal={view !== "distribution"}
                    />
                    {view === "distribution" ? (
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        domain={[0, "auto"]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                      />
                    ) : (
                      xAxis
                    )}
                    {view === "distribution" ? (
                      <YAxis
                        type="category"
                        dataKey="range"
                        width={100}
                        interval={0}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                      />
                    ) : (
                      yAxis
                    )}
                    {tooltip}
                    {view === "distribution" ? (
                      <Bar
                        dataKey="count"
                        fill={metric.color}
                        radius={[0, 3, 3, 0]}
                        maxBarSize={20}
                        isAnimationActive={false}
                      />
                    ) : (
                      <>
                        <Bar
                          dataKey="wait"
                          stackId="time"
                          fill="#2563eb"
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="remaining"
                          stackId="time"
                          fill="#7c3aed"
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                        />
                        <ChartLegend content={<ChartLegendContent />} />
                      </>
                    )}
                  </BarChart>
                )}
              </ChartContainer>
            ) : (
              <p className="v2-empty">
                No usable {view === "breakdown" ? "paired timing" : "recorded"}{" "}
                values for this view.
              </p>
            )}
            <div className="v2-axis-label">
              {view === "distribution"
                ? "Number of requests"
                : "Request number"}
            </div>
          </TabsContent>
        </Tabs>
        <div className="v2-distribution-summary">
          <span>
            P10{" "}
            <strong>
              {format(percentile(values, 0.1))}
              {values.length ? ` ${metric.unit}` : ""}
            </strong>
          </span>
          <span>
            Median{" "}
            <strong>
              {format(percentile(values, 0.5))}
              {values.length ? ` ${metric.unit}` : ""}
            </strong>
          </span>
          <span>
            P90{" "}
            <strong>
              {format(percentile(values, 0.9))}
              {values.length ? ` ${metric.unit}` : ""}
            </strong>
          </span>
          <span>Within-run percentiles</span>
        </div>
        <p className="v2-chart-note">
          {view === "breakdown"
            ? `Each stacked bar adds up to that request’s actual duration. The remainder includes generation and stream/runtime overhead; it is not pure decode time. ${paired} paired requests available.`
            : metric.note}
        </p>
      </CardContent>
    </Card>
  );
}
function tokenRange(samples: Sample[], field: "inputTokens" | "outputTokens") {
  const values = samples.flatMap((s) =>
    s[field] === null ? [] : [s[field] as number],
  );
  if (!values.length) return "Not recorded";
  const min = Math.min(...values),
    max = Math.max(...values);
  return `${min === max ? min : `${min}–${max}`} tokens${values.length !== samples.length ? " · partial coverage" : ""}`;
}
export function PerformanceWorkspace({
  samples,
  recorded,
}: {
  samples: Sample[];
  recorded: boolean;
}) {
  const rows = performanceRows(samples);
  const valid = samples.filter((s) => !s.warmup && s.valid);
  return (
    <div className="v2-performance-workspace">
      <div className="v2-performance-context">
        <span>
          {recorded ? "Recorded requests" : "Illustrative data"}
          <strong>
            {valid.length} valid · {rows.length} total
          </strong>
        </span>
        <span>
          Input per request<strong>{tokenRange(valid, "inputTokens")}</strong>
        </span>
        <span>
          Output per request<strong>{tokenRange(valid, "outputTokens")}</strong>
        </span>
        <span>
          Warmup
          <strong>{samples.filter((s) => s.warmup).length} excluded</strong>
        </span>
      </div>
      {metrics.map((metric) => (
        <MetricSection
          key={metric.key as PerformanceMetric}
          metric={metric}
          rows={rows}
        />
      ))}
      <p className="v2-chart-note">
        These charts describe requests within one run. They do not show
        variation across independent runs.
      </p>
    </div>
  );
}
