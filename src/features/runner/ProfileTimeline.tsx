"use client";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import { distribution, durationLabel } from "../../benchmark/protocol/schedule";
import type { Report } from "../../benchmark/schemas/report";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "../../components/ui/chart";
import { Select } from "../../components/ui/select";

import {
  phaseAt,
  phaseColor,
  phaseLabels,
  secondsLabel,
  timelineWindow,
  withinRun,
} from "../../benchmark/metrics/timeline";
import { TimelinePhases } from "./TimelinePhases";
const memories = [
  {
    value: "main",
    label: "Main-page JS heap",
    description: "Browser estimate · excludes worker and GPU",
  },
  {
    value: "wasm",
    label: "Worker WASM linear memory",
    description: "Reachable address-space length · not resident RAM",
  },
  {
    value: "gpu",
    label: "Tracked live GPUBuffer sizes",
    description:
      "Requested allocations minus explicit destruction · not physical VRAM",
  },
  {
    value: "worker",
    label: "Worker JS heap",
    description: "Optional legacy heap estimate · not total worker memory",
  },
];
export function ProfileTimeline({
  report,
  live = false,
}: {
  report?: Report;
  live?: boolean;
}) {
  const [memory, setMemory] = useState("wasm");
  const p = report?.profile;
  if (!p)
    return (
      <section id="profiling-plan" className="profile-view">
        <h2>Resource timeline</h2>
        <p>
          This report has no continuous resource samples. Enable resource
          sampling on a new run to record a timeline.
        </p>
      </section>
    );
  const window = timelineWindow(p, live);
  const end = window.end;
  const points = withinRun(p.points, window.endMs);
  const bands = () =>
    window.phases.map((phase, i) => (
      <ReferenceArea
        key={i}
        x1={phase.startMs / 1000}
        x2={phase.endMs / 1000}
        fill={phaseColor(phase.phase)}
        fillOpacity={0.6}
        strokeOpacity={0}
      />
    ));
  const data = points
    .filter((x) => x.scope === (memory === "main" ? "main" : "worker"))
    .map((x) => ({
      time: x.tMs / 1000,
      value:
        (memory === "gpu"
          ? x.gpuBufferBytes
          : memory === "wasm"
            ? x.wasmBytes
            : x.heapBytes) === null
          ? null
          : (memory === "gpu"
              ? x.gpuBufferBytes!
              : memory === "wasm"
                ? x.wasmBytes!
                : x.heapBytes!) / 1e6,
    }));
  const vals = data.flatMap((x) => (x.value === null ? [] : [x.value]));
  const signalId = {
    main: "main-heap",
    wasm: "worker-wasm",
    gpu: "gpu-buffers",
    worker: "worker-heap",
  }[memory];
  const selectedSignal = p.signals.find((s) => s.id === signalId);
  const workerPoints = points.filter((x) => x.scope === "worker");
  const workerHeapAvailable = workerPoints.some((x) => x.heapBytes !== null);
  const peak = (key: "wasmBytes" | "gpuBufferBytes") => {
    const readings = workerPoints.flatMap((x) =>
      x[key] === null ? [] : [x[key]!],
    );
    return readings.length
      ? `${(Math.max(...readings) / 1e6).toFixed(2)} MB`
      : "Not recorded";
  };
  const memoryOptions = memories.map((option) => ({
    ...option,
    disabled: option.value === "worker" && !workerHeapAvailable,
    description:
      option.value === "worker" && !workerHeapAvailable
        ? "Not recorded in this run · see worker memory coverage below"
        : option.description,
  }));
  const requests = withinRun(p.events, window.endMs).filter(
    (x) => x.type === "request-start" && x.phase === "active",
  );
  const incidents = [
    ...p.events.filter(
      (x) => !["phase", "request-start", "request-end"].includes(x.type),
    ),
    ...report!.samples
      .filter((s) => !s.valid && s.endedMs !== undefined)
      .map((s) => ({
        tMs: s.endedMs!,
        phase: s.warmup ? "warmup" : "active",
        type: "invalid-output",
        label: `Request ${s.requestIndex ?? "?"} failed the saved output validity check`,
      })),
  ].sort((a, b) => a.tMs - b.tMs);
  const valid = report!.samples.filter((x) => !x.warmup && x.valid);
  const metrics = [
    { name: "First output", key: "firstOutputMs" as const, unit: "ms" },
    { name: "Response", key: "responseMs" as const, unit: "ms" },
    {
      name: "Decode speed",
      key: "decodeTokensPerSecond" as const,
      unit: "tok/s",
    },
  ];
  return (
    <section id="profiling-plan" className="profile-view">
      <div className="group-heading">
        <div>
          <h2>Resource timeline</h2>
          <p>
            {live ? "Live observations" : "Saved observations"} ·{" "}
            {p.enabled
              ? "1-second sampling + phase boundaries"
              : "resource sampling disabled"}{" "}
            · warmup excluded from request statistics
          </p>
        </div>
      </div>
      <div className="profile-summary">
        <span>
          Outcome: <strong>{live ? "running" : report!.status}</strong>
        </span>
        <span>
          <strong>{p.completedRequests}</strong> measured requests ·{" "}
          {valid.length} valid
        </span>
        <span>
          <strong>
            {p.activeStartedMs === null
              ? "—"
              : durationLabel(
                  (p.activeEndedMs ?? end * 1000) - p.activeStartedMs,
                )}
          </strong>{" "}
          active
        </span>
        <span>
          <strong>{durationLabel(end * 1000)}</strong> total
        </span>
        <span>
          <strong>{p.points.length}</strong> samples
        </span>
        <span>
          Unload:{" "}
          <strong>
            {live
              ? "pending"
              : p.unloadConfirmed
                ? "confirmed"
                : "not confirmed"}
          </strong>
        </span>
      </div>
      <TimelinePhases profile={p} live={live} />
      {p.enabled && (
        <>
          <div className="memory-explanation">
            <strong>Memory captured inside the inference worker</strong>
            <div className="memory-evidence">
              <span>
                Peak WASM linear memory<strong>{peak("wasmBytes")}</strong>
              </span>
              <span>
                Peak tracked GPU buffers
                <strong>{peak("gpuBufferBytes")}</strong>
              </span>
              <span>
                Worker JavaScript heap
                <strong>
                  {workerHeapAvailable
                    ? "Legacy estimate available"
                    : "Not measured"}
                </strong>
              </span>
            </div>
            <p>
              The model runs in a dedicated web worker. Its runtime uses WASM
              memory and creates WebGPU buffers; the JavaScript heap is only one
              part. These are allocation sizes, not physical RAM, and must not
              be added to the native process footprint.
            </p>
            {!workerHeapAvailable && (
              <p>
                The browser did not expose a JavaScript heap reading inside this
                worker. That does not mean zero memory or a failed run. The
                native process measurement includes the worker within its
                renderer process, but cannot separate its memory from the rest
                of that process.
              </p>
            )}
          </div>
          <div className="profile-chart-heading">
            <Select
              label="Memory signal"
              value={memory}
              onValueChange={setMemory}
              options={memoryOptions}
            />
            <span>
              {vals.length
                ? `Sampled maximum ${Math.max(...vals).toFixed(2)} MB`
                : "No readings for this signal"}
            </span>
          </div>
          {!vals.length ? (
            <div className="memory-explanation" role="status">
              <strong>
                {memories.find((m) => m.value === memory)?.label}: no
                measurement recorded
              </strong>
              <p>
                {selectedSignal?.reason ??
                  "This run contains no readings for this signal."}
              </p>
              <p>
                Select worker WASM memory or tracked GPU buffers to inspect the
                captured worker allocations. Missing readings are never plotted
                as zero.
              </p>
            </div>
          ) : (
            <div
              className="profile-chart"
              aria-label={`${memories.find((x) => x.value === memory)?.label} over elapsed time`}
            >
              <ChartContainer
                style={{ height: 240 }}
                config={{
                  value: {
                    label: `${memories.find((m) => m.value === memory)?.label} (MB)`,
                    color: "var(--chart-3)",
                  },
                }}
              >
                <LineChart
                  accessibilityLayer
                  data={data}
                  margin={{ left: 12, right: 18, top: 12, bottom: 12 }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    axisLine={false}
                    tickLine={false}
                    tickMargin={10}
                    dataKey="time"
                    type="number"
                    domain={[0, end]}
                    ticks={window.ticks}
                    allowDataOverflow
                    tickFormatter={secondsLabel}
                  />
                  <YAxis
                    unit=" MB"
                    width={78}
                    axisLine={false}
                    tickLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        nameKey="dataKey"
                        labelFormatter={(_, payload) => {
                          const time = Number(payload[0]?.payload?.time ?? 0);
                          return `${time.toFixed(2)}s · ${phaseLabels[phaseAt(p, time * 1000)]}`;
                        }}
                      />
                    }
                  />
                  {bands()}
                  <Line
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          )}
          <div
            className="request-markers"
            aria-label={`${requests.length} measured request start markers`}
          >
            {requests.map((x, i) => (
              <span
                key={i}
                style={{
                  left: `${Math.min(100, (x.tMs / (end * 1000)) * 100)}%`,
                }}
                title={`${x.label} · ${(x.tMs / 1000).toFixed(2)} s`}
              />
            ))}
            {withinRun(incidents, window.endMs).map((x, i) => (
              <span
                className="incident-marker"
                key={`incident-${i}`}
                style={{
                  left: `${Math.min(100, (x.tMs / (end * 1000)) * 100)}%`,
                }}
                title={`${x.type}: ${x.label} · ${(x.tMs / 1000).toFixed(2)} s`}
              />
            ))}
          </div>
          <p className="metric-footnote">
            Blue ticks mark measured request starts; rose ticks mark
            cancellation, failure, invalid output or device lifecycle events.
            All request ends, failures and lifecycle events are retained in the
            export. Gaps stay missing; sampled maxima can miss shorter peaks.
            GPU buffers are an allocation ledger, WASM is linear address space,
            and heap is a browser estimate.
          </p>
          <h3>
            Event-loop delay <small>· responsiveness, not CPU usage</small>
          </h3>
          <div className="profile-chart">
            <ChartContainer
              style={{ height: 200 }}
              config={{
                main: { label: "Main page (ms)", color: "var(--chart-1)" },
                worker: {
                  label: "Inference worker (ms)",
                  color: "var(--chart-2)",
                },
              }}
            >
              <LineChart
                accessibilityLayer
                margin={{ left: 12, right: 18, top: 12, bottom: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  axisLine={false}
                  tickLine={false}
                  tickMargin={10}
                  dataKey="time"
                  type="number"
                  domain={[0, end]}
                  ticks={window.ticks}
                  allowDataOverflow
                  tickFormatter={secondsLabel}
                />
                <YAxis
                  unit=" ms"
                  width={78}
                  axisLine={false}
                  tickLine={false}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="name"
                      labelFormatter={(_, payload) => {
                        const time = Number(payload[0]?.payload?.time ?? 0);
                        return `${time.toFixed(2)}s · ${phaseLabels[phaseAt(p, time * 1000)]}`;
                      }}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent nameKey="value" />} />
                {bands()}
                {(["main", "worker"] as const).map((scope) => (
                  <Line
                    key={scope}
                    name={scope}
                    data={points
                      .filter((x) => x.scope === scope)
                      .map((x) => ({
                        time: x.tMs / 1000,
                        delay: x.eventLoopDelayMs,
                      }))}
                    dataKey="delay"
                    stroke={`var(--color-${scope})`}
                    strokeWidth={2}
                    connectNulls={false}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          </div>
          <p className="metric-footnote">
            Blue: main page · teal: inference worker. Timer drift includes
            scheduling and synchronous work.
          </p>
        </>
      )}
      <h3>Measured request distribution</h3>
      <div className="table-scroll">
        <table className="profile-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th>Valid readings</th>
              <th>Median</th>
              <th>Minimum</th>
              <th>Maximum</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => {
              const d = distribution(valid.map((x) => x[m.key]));
              return (
                <tr key={m.key}>
                  <th>{m.name}</th>
                  <td>{d.count}</td>
                  {[d.median, d.min, d.max].map((v, i) => (
                    <td key={i}>
                      {v === null ? "—" : `${v.toFixed(1)} ${m.unit}`}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="metric-footnote">
        These statistics describe requests within this run, not variation across
        independent runs.
      </p>
      <details className="detail-disclosure">
        <summary>Signal availability, scope & sampling cost</summary>
        <div className="disclosure-body">
          <div className="profile-signals">
            {p.signals.map((s) => (
              <div key={s.id}>
                <strong>
                  {s.label} <span className="badge">{s.status}</span>
                </strong>
                <p>
                  {s.scope} · {s.unit} · {s.source}
                </p>
                <p>{s.reason}</p>
              </div>
            ))}
          </div>
          <p>
            Sampler callback time: main {p.overhead.mainCallbackMs.toFixed(2)}{" "}
            ms / {p.overhead.mainCallbacks} callbacks; worker{" "}
            {p.overhead.workerCallbackMs.toFixed(2)} ms /{" "}
            {p.overhead.workerCallbacks} callbacks. Maximum callback:{" "}
            {p.overhead.mainMaxCallbackMs.toFixed(2)} /{" "}
            {p.overhead.workerMaxCallbackMs.toFixed(2)} ms. This measures
            collection only; rendering, message delivery and allocation hooks
            are excluded. Compare an equivalent sampling-off run for end-to-end
            impact; sequential runs are not a controlled overhead estimate.
          </p>
          <p>
            CPU pressure: {p.pressure.length} actual coarse system observations.{" "}
            {p.signals.find((s) => s.id === "cpu-pressure")?.reason}
          </p>
          {p.pressure.length > 0 && (
            <p>
              {p.pressure.map((x, i) => (
                <span key={i}>
                  {(x.tMs / 1000).toFixed(1)}s {x.state} ·{" "}
                </span>
              ))}
            </p>
          )}
          <p>{p.network.note}</p>
        </div>
      </details>
      <details className="detail-disclosure">
        <summary>Lifecycle events & stop reason ({incidents.length})</summary>
        <div className="disclosure-body">
          <p>
            Stop reason: {p.stopReason}. Reset policy: {p.plan.resetPolicy}.
          </p>
          {incidents.map((x, i) => (
            <p key={i}>
              {(x.tMs / 1000).toFixed(2)} s · {x.phase} · {x.type}: {x.label}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
