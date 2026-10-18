"use client";
import { Activity, ArrowRight } from "lucide-react";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import {
  observedPeak,
  resourceSeries,
} from "../../benchmark/metrics/resource-series";
import { phaseLabels, secondsLabel } from "../../benchmark/metrics/timeline";
import type { Report } from "../../benchmark/schemas/report";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
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

type Datum = { [key: string]: number | null };
type Series = { key: string; label: string; color: string };
export function ResourceChart({
  title,
  scope,
  note,
  data,
  lines,
  window,
  unit,
  percent = false,
  emptyNote = "Select Full session to check for readings outside this stage.",
}: {
  title: string;
  scope: string;
  note: string;
  data: Datum[];
  lines: Series[];
  window: ReturnType<typeof resourceSeries>["window"];
  unit: string;
  percent?: boolean;
  emptyNote?: string;
}) {
  const available = data.some((p) => lines.some((l) => p[l.key] != null));
  const peak = observedPeak(data, lines[0].key);
  return (
    <Card className="v2-chart-card">
      <CardHeader>
        <div className="v2-card-eyebrow">
          <span>{scope}</span>
          <span>{available ? "Recorded" : "No readings"}</span>
        </div>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <div className="v2-chart-number">
          {peak === null
            ? "Unavailable"
            : `${peak.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${unit}`}
          <small>
            {peak !== null
              ? `sampled peak · ${lines.length > 1 ? lines[0].label : "selected window"}`
              : "in this window"}
          </small>
        </div>
      </CardHeader>
      <CardContent>
        {available ? (
          <ChartContainer
            style={{ height: 205 }}
            config={Object.fromEntries(
              lines.map((l) => [l.key, { label: l.label, color: l.color }]),
            )}
          >
            <LineChart
              accessibilityLayer
              data={data}
              syncId="v2-resources"
              syncMethod="value"
              margin={{ top: 12, left: 0, right: 15, bottom: 5 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={[window.startMs / 1000, window.endMs / 1000]}
                ticks={window.ticks}
                allowDataOverflow
                tickFormatter={secondsLabel}
                axisLine={false}
                tickLine={false}
                tickMargin={8}
                minTickGap={12}
              />
              <YAxis
                width={55}
                domain={percent ? [0, 100] : [0, "auto"]}
                axisLine={false}
                tickLine={false}
              />
              {window.phases
                .filter(
                  (p) =>
                    (p.phase === "active" || p.phase === "warmup") &&
                    p.endMs > window.startMs &&
                    p.startMs < window.endMs,
                )
                .map((p, i) => (
                  <ReferenceArea
                    key={i}
                    x1={Math.max(p.startMs, window.startMs) / 1000}
                    x2={Math.min(p.endMs, window.endMs) / 1000}
                    ifOverflow="hidden"
                    fill={
                      p.phase === "active" ? "var(--chart-1)" : "var(--chart-3)"
                    }
                    fillOpacity={0.035}
                    strokeOpacity={0}
                  />
                ))}
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    nameKey="dataKey"
                    labelFormatter={(_, payload) =>
                      `${Number(payload[0]?.payload?.time ?? 0).toFixed(2)}s from run start`
                    }
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {lines.map((l) => (
                <Line
                  key={l.key}
                  dataKey={l.key}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={data.length < 3 ? { r: 3 } : false}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        ) : (
          <div className="v2-unavailable">
            <Activity size={22} />
            <strong>No captured samples in this window</strong>
            <span>{emptyNote}</span>
          </div>
        )}
        <p className="v2-chart-note">{note}</p>
      </CardContent>
    </Card>
  );
}
const blue = "var(--chart-1)",
  teal = "var(--chart-2)",
  violet = "var(--chart-3)";
export function ResourceWorkspace({ report }: { report: Report }) {
  const [phase, setPhase] = useState("all");
  const [allocation, setAllocation] = useState("worker");
  const [responsiveness, setResponsiveness] = useState("main");
  const { window, processes, power, worker, main, browserGpu } = resourceSeries(
    report,
    phase,
  );
  if (!report.profile)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Timeline not captured</CardTitle>
          <CardDescription>
            This report has no continuous resource samples. Any saved snapshots
            remain in the downloadable JSON report.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  return (
    <div className="v2-resources">
      <Card className="v2-phase-control">
        <CardHeader>
          <div className="v2-card-eyebrow">
            <span>Filter by test stage</span>
            <span>{(report.profile.totalMs / 1000).toFixed(2)}s total</span>
          </div>
          <CardTitle>
            <h3>Resource timeline</h3>
          </CardTitle>
          <CardDescription>
            Select a stage to filter all resource charts. Setup, Use and Release
            are benchmark stages. Time starts when the browser run begins.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="v2-phases v2-stage-filters"
            aria-label="Resource stage filter"
          >
            <Button
              variant={phase === "all" ? "default" : "outline"}
              aria-pressed={phase === "all"}
              onClick={() => setPhase("all")}
            >
              Full session
              <small>0–{secondsLabel(report.profile!.totalMs / 1000)}</small>
            </Button>
            {window.groups.map((g) => (
              <Button
                key={g.id}
                variant={phase === g.id ? "default" : "outline"}
                aria-pressed={phase === g.id}
                onClick={() => setPhase(g.id)}
              >
                {g.label}
                <small>{g.detail}</small>
              </Button>
            ))}
          </div>
          <Accordion type="single" collapsible>
            <AccordionItem value="timing">
              <AccordionTrigger>
                Detailed timing & measurement boundaries
              </AccordionTrigger>
              <AccordionContent>
                <p>
                  Baseline observes the page before model loading. Warmup is a
                  preparation request excluded from performance summaries.
                  Loaded idle means we deliberately send no new requests; it
                  does not prove the worker or browser is suspended. The
                  after-unload interval is an observation, not a guarantee that
                  all memory was reclaimed.
                </p>
                {report.profile.plan.countSchedule && (
                  <p>
                    Three windows of 20 completed responses, sent sequentially
                    without added delays. Each of the two loaded-idle gaps lasts
                    at least 90 seconds after the preceding response finishes.
                    Warmup is excluded; the model stays loaded between windows.
                  </p>
                )}
                {report.profile.plan.sessionSchedule && (
                  <p>
                    {report.profile.plan.sessionSchedule.requestGapMs === 0
                      ? "Requests run back-to-back within each window, with no deliberate delay after a response."
                      : `This saved run waited ${report.profile.plan.sessionSchedule.requestGapMs / 1000} seconds between requests.`}{" "}
                    Longer loaded pauses separate the three windows. A request
                    already in flight may finish beyond its window; actual
                    boundaries are shown. The same worker and engine remain
                    loaded throughout Use; each request resets chat for
                    repeatability. This is a controlled usage scenario, not a
                    recording of human behavior.
                  </p>
                )}
                <div className="v2-detailed-phases">
                  {window.phases.map((p, i) => (
                    <Button
                      key={i}
                      variant={
                        phase === `interval:${i}` ? "default" : "outline"
                      }
                      aria-pressed={phase === `interval:${i}`}
                      onClick={() => setPhase(`interval:${i}`)}
                    >
                      {(report.profile?.plan.sessionSchedule ||
                        report.profile?.plan.countSchedule) &&
                      p.phase === "idle"
                        ? "Loaded idle"
                        : (report.profile?.plan.sessionSchedule ||
                              report.profile?.plan.countSchedule) &&
                            p.phase === "active"
                          ? "Request window"
                          : phaseLabels[p.phase]}
                      <small>
                        {secondsLabel(p.startMs / 1000)}–
                        {secondsLabel(p.endMs / 1000)}
                      </small>
                    </Button>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <div className="v2-window-caption" role="status">
            <span>
              <span className="v2-dot" />
              {phase === "all"
                ? "Full session"
                : (window.groups.find((g) => g.id === phase)?.label ??
                  "Selected timing interval")}{" "}
              · {secondsLabel(window.startMs / 1000)} <ArrowRight size={12} />{" "}
              {secondsLabel(window.endMs / 1000)}
            </span>
            <span>
              {report.profile.plan.sessionSchedule ||
              report.profile.plan.countSchedule
                ? "Shading: request windows · ≈1s sampling"
                : "Shared time axis · ≈1s sampling"}
            </span>
          </div>
        </CardContent>
      </Card>
      <div className="v2-chart-grid">
        <ResourceChart
          title="CPU capacity"
          scope="Browser processes"
          data={processes}
          window={window}
          lines={[{ key: "cpu", label: "CPU capacity (%)", color: blue }]}
          unit="%"
          percent
          note={`Usage divided by ${report.nativeTrace?.logicalCpus ?? "the recorded number of"} logical CPUs. This measures CPU time, not reserved cores. Intervals crossing the selected start are omitted.`}
        />
        <ResourceChart
          title="Accounted memory"
          scope="Browser processes"
          data={processes}
          window={window}
          lines={[
            {
              key: "footprint",
              label: "Process footprints (MB)",
              color: violet,
            },
          ]}
          unit="MB"
          note="Sum of OS-accounted process footprints. Includes the renderer containing the worker; not deduplicated physical RAM. Do not add worker allocations to this figure."
        />
        <ResourceChart
          title="Chrome GPU time"
          scope="Dedicated Chrome · experimental"
          data={browserGpu}
          window={window}
          lines={[
            { key: "gpuTime", label: "Driver GPU time (ms/s)", color: teal },
          ]}
          unit="ms/s"
          note="GPU time accumulated per elapsed second by this Chrome process tree. Includes browser rendering and command-buffer overhead; concurrent queues may overlap. This is not shader occupancy, GPU capacity, or model-only utilization. Intervals crossing the selected start are omitted."
          emptyNote={
            report.nativeTrace?.gpu?.length
              ? "No complete GPU counter intervals in this window. Try the full session; counter changes remain gaps."
              : "This report has no process GPU counters. A fresh capture with the native collector is required."
          }
        />
        <ResourceChart
          title="GPU activity"
          scope="Whole machine"
          data={processes}
          window={window}
          lines={[{ key: "gpu", label: "Host GPU activity (%)", color: teal }]}
          unit="%"
          percent
          note="Host-wide driver reading, including other applications. Its sampling window is driver-defined. This is not model-only GPU utilization or a count of GPU cores."
        />
        <ResourceChart
          title="Subsystem power"
          scope="Whole machine"
          data={power}
          window={window}
          lines={[
            { key: "cpu", label: "CPU (W)", color: blue },
            { key: "gpu", label: "GPU (W)", color: teal },
            { key: "ane", label: "ANE (W)", color: violet },
          ]}
          unit="W"
          note="Host CPU, GPU and ANE estimates. Not wall-socket power or model-only watts. Collection timestamps are approximate; intervals crossing the selected start are omitted."
        />
        <div>
          <Tabs value={allocation} onValueChange={setAllocation}>
            <TabsList aria-label="Allocation scope">
              <TabsTrigger value="worker">Inference worker</TabsTrigger>
              <TabsTrigger value="main">Main page</TabsTrigger>
            </TabsList>
            <TabsContent value="worker">
              <ResourceChart
                title="Worker allocations"
                scope="Browser instrumentation"
                data={worker}
                window={window}
                lines={[
                  { key: "buffers", label: "GPU buffers (MB)", color: teal },
                  {
                    key: "wasm",
                    label: "WASM linear memory (MB)",
                    color: violet,
                  },
                ]}
                unit="MB"
                note={`Tracked buffer sizes and WASM address space, not physical GPU or RAM residency. ${report.profile.points.some((p) => p.scope === "worker" && p.heapBytes !== null) ? "A legacy worker heap estimate is retained in the report." : "Worker JS heap was not exposed in this capture."}`}
              />
            </TabsContent>
            <TabsContent value="main">
              <ResourceChart
                title="Page JavaScript heap"
                scope="Browser estimate"
                data={main}
                window={window}
                lines={[
                  { key: "heap", label: "Main-page heap (MB)", color: violet },
                ]}
                unit="MB"
                note="Legacy browser heap estimate. Excludes the inference worker and GPU; this is not total model memory."
              />
            </TabsContent>
          </Tabs>
        </div>
        <div>
          <Tabs value={responsiveness} onValueChange={setResponsiveness}>
            <TabsList aria-label="Responsiveness scope">
              <TabsTrigger value="main">Main page</TabsTrigger>
              <TabsTrigger value="worker">Inference worker</TabsTrigger>
            </TabsList>
            {["main", "worker"].map((scope) => (
              <TabsContent key={scope} value={scope}>
                <ResourceChart
                  title="Responsiveness"
                  scope={
                    scope === "main"
                      ? "Main-page scheduling"
                      : "Worker scheduling"
                  }
                  data={scope === "main" ? main : worker}
                  window={window}
                  lines={[
                    { key: "lag", label: "Timer delay (ms)", color: blue },
                  ]}
                  unit="ms"
                  note="Delay of a scheduled callback, including scheduling and synchronous work. This measures responsiveness, not CPU utilization."
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
      {report.nativeTrace?.gpuValidation &&
        (() => {
          const validation = report.nativeTrace.gpuValidation;
          return (
            <Card>
              <CardHeader>
                <div className="v2-card-eyebrow">
                  <span>Local validation</span>
                  <span>Metal System Trace</span>
                </div>
                <CardTitle>
                  <h3>Chrome counter validation</h3>
                </CardTitle>
                <CardDescription>
                  Counter {(validation.counterMs / 1000).toFixed(2)}s · trace
                  command-buffer spans{" "}
                  {(validation.commandBufferEnvelopeMs / 1000).toFixed(2)}s ·{" "}
                  {(validation.relativeDifference * 100).toFixed(1)}%
                  difference.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="v2-chart-note">
                  {validation.note} These totals cover the shared validation
                  capture, including surrounding idle time; the stage filter
                  applies to charts above.
                </p>
              </CardContent>
            </Card>
          );
        })()}
      <Accordion type="single" collapsible className="v2-coverage">
        <AccordionItem value="coverage">
          <AccordionTrigger>
            Measurement coverage & collection details
          </AccordionTrigger>
          <AccordionContent>
            <p>
              Charts exclude samples before the browser start and after stop.
              Missing readings remain gaps. The original report retains
              additional capture context. Host signals do not isolate this
              model.
            </p>
            <div className="v2-coverage-grid">
              {report.nativeTrace?.coverage.map((s) => (
                <div key={s.id}>
                  <strong>{s.label}</strong>
                  <span>
                    {s.status} · {s.scope}
                  </span>
                  <p>{s.reason}</p>
                </div>
              ))}
              {report.profile.signals.map((s) => (
                <div key={s.id}>
                  <strong>{s.label}</strong>
                  <span>
                    {s.status} · {s.scope}
                  </span>
                  <p>{s.reason}</p>
                </div>
              ))}
            </div>
            <p>
              Browser API coverage and native collector coverage describe
              different sources. A browser API being unavailable does not negate
              an attached native measurement.
            </p>
            <p>
              Sampler callback cost: main{" "}
              {report.profile.overhead.mainCallbackMs.toFixed(2)}ms; worker{" "}
              {report.profile.overhead.workerCallbackMs.toFixed(2)}ms. This is
              recorded callback cost, not an estimate of total profiling
              overhead.
            </p>
            {report.nativeTrace && (
              <p>
                Maximum recorded clock drift:{" "}
                {report.nativeTrace.clockAlignment.maxNativeWallClockDriftMs.toFixed(
                  2,
                )}
                ms. {report.nativeTrace.clockAlignment.notes}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
