"use client";
import {
  Activity,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  Gauge,
  Layers,
  ListChecks,
  Play,
  Settings2,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Report } from "../../benchmark/schemas/report";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SiteLink } from "../../components/SiteLink";
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
import { replaceUrl } from "../../lib/urls";
import type { Row } from "../leaderboard/data";
import {
  artifacts,
  bytesLabel,
  catalog,
  numberLabel,
  parameterLabel,
  precision,
  primaryReportFor,
  secondsLabel,
  workloadLabel,
} from "../leaderboard/data";

import { downloadJson } from "../../lib/download";
import { leaderboardBack, modelSection } from "../../lib/model-route";
import { PerformanceWorkspace } from "./PerformanceWorkspace";
import { RequestExplorer } from "./RequestExplorer";
import { ResourceWorkspace } from "./ResourceWorkspace";
import "./model-report.css";

function SectionTitle({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="v2-section-title">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}
function Facts({ items }: { items: [string, string | number][] }) {
  return (
    <dl className="v2-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function osLabel(report?: Report) {
  const collector = report?.nativeTrace?.provenance.collector;
  if (
    collector &&
    typeof collector === "object" &&
    "os" in collector &&
    typeof collector.os === "string"
  ) {
    const version = collector.os.match(/ProductVersion:\s*([^\n]+)/)?.[1];
    if (version) return `macOS ${version}`;
  }
  return (
    report?.environment.browserCapabilities?.platform ??
    "OS version not recorded"
  );
}
function gpuLabel(raw?: string | null) {
  if (!raw) return "Not exposed";
  try {
    const adapter = JSON.parse(raw);
    return (
      [adapter.vendor, adapter.architecture]
        .filter(
          (v): v is string => typeof v === "string" && v !== "Not exposed",
        )
        .join(" · ") || "Not exposed"
    );
  } catch {
    return raw;
  }
}
export default function ModelReport({
  slug,
  params,
  allRows,
  onReport,
  localReportId,
}: {
  localReportId?: string;
  slug: string;
  params: URLSearchParams;
  allRows: Row[];
  onReport: (r: Report) => void;
}) {
  const [activeSection, setActiveSection] = useState(
    modelSection(params.get("section")) ?? "v2-performance",
  );
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const headerBottom =
        document.querySelector("#root > header")?.getBoundingClientRect()
          .bottom ?? 0;
      const nav = document.querySelector<HTMLElement>(".v2-section-nav");
      const navHeight =
        nav && getComputedStyle(nav).flexDirection === "row"
          ? nav.offsetHeight
          : 0;
      const passed = [
        ...document.querySelectorAll<HTMLElement>(
          ".v2-section-content > section",
        ),
      ].filter(
        (el) => el.getBoundingClientRect().top <= headerBottom + navHeight + 40,
      );
      const atEnd =
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >=
          document.documentElement.scrollHeight - 2;
      setActiveSection(
        atEnd ? "v2-configuration" : (passed.at(-1)?.id ?? "v2-performance"),
      );
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    const initialFrame = requestAnimationFrame(() => {
      const id = modelSection(params.get("section"));
      if (id)
        document
          .getElementById(id)
          ?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => {
      cancelAnimationFrame(initialFrame);
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const model = catalog.find((m) => m.slug === slug);
  const artifact =
    artifacts.find(
      (a) => a.model_id === params.get("artifact") && a.model.slug === slug,
    ) ??
    artifacts.find((a) => a.model.slug === slug && a.runnable) ??
    artifacts.find((a) => a.model.slug === slug);
  if (!model || !artifact)
    return (
      <div className="empty">
        <h1>Model not found</h1>
        <SiteLink href="/">Open leaderboard</SiteLink>
      </div>
    );
  const primary = primaryReportFor(
    allRows.flatMap((r) => (r.report ? [r.report] : [])),
    artifact.model_id,
  );
  const source = params.get("source") ?? "measured";
  const cohort = params.get("cohort") ?? (primary ? `run:${primary.id}` : "");
  const cohortRows = allRows.filter(
    (r) => r.source === source && r.cohort === cohort,
  );
  const row = cohortRows.find(
    (r) =>
      r.source === "measured" &&
      r.report &&
      r.artifact.model_id === artifact.model_id,
  );
  if (!row?.report)
    return (
      <article className="model-v2">
        <div className="v2-topline">
          <SiteLink href={leaderboardBack(params.get("back"))}>
            <ArrowLeft size={14} />
            Back to leaderboard
          </SiteLink>
        </div>
        <h1 className="model-branded-title">
          <ProviderLogo family={model.family} model={model.name} />
          {model.name}
        </h1>
        <div className="empty">
          <h2>No measured results for this selection</h2>
          <p>This model or run has no saved measurement here.</p>
          <Button asChild variant="outline">
            <SiteLink href="/">Browse tested models</SiteLink>
          </Button>
          {primary && source === "illustrative" && (
            <Button asChild>
              <SiteLink
                href={`/models/${slug}?${new URLSearchParams({ artifact: artifact.model_id, source: "measured", cohort: `run:${primary.id}` })}`}
              >
                Open latest measured run
              </SiteLink>
            </Button>
          )}
        </div>
      </article>
    );
  const report = row?.report;
  const p = report?.profile;
  const measured =
    report?.samples.filter((s) => !s.warmup) ?? row?.samples ?? [];
  const valid = measured.filter((s) => s.valid);
  const back = localReportId
    ? "/local-results/"
    : leaderboardBack(params.get("back"));
  const activeMs =
    p?.activeStartedMs != null && p.activeEndedMs != null
      ? p.activeEndedMs - p.activeStartedMs
      : null;
  const go = (id: string) => {
    setActiveSection(id);
    const next = new URLSearchParams(params);
    next.set("section", id.replace(/^v2-/, ""));
    replaceUrl(
      `${localReportId ? `/local-report/` : `/models/${slug}/`}?${localReportId ? `id=${localReportId}&` : ""}${next}`,
    );
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "instant", block: "start" });
  };
  const sections = [
    ["v2-performance", "Performance", Gauge],
    ["v2-resources", "Resources", Activity],
    ["v2-requests", "Requests", ListChecks],
    ["v2-configuration", "Configuration", Settings2],
  ] as const;
  return (
    <article className="model-v2">
      <div className="v2-topline">
        <SiteLink href={back}>
          <ArrowLeft size={14} />
          {localReportId ? "Back to local results" : "Back to leaderboard"}
        </SiteLink>
      </div>
      <div className="v2-hero">
        <div>
          <div className="v2-eyebrow">{model.family} / Browser benchmark</div>
          <h1 className="model-branded-title">
            <ProviderLogo family={model.family} model={model.name} />
            {model.name}
          </h1>
          <p>A closer look at how this model runs in the browser.</p>
          <div className="v2-hero-meta">
            <span>{parameterLabel(model.parameters)} parameters</span>
            <span>{precision[artifact.encoding]}</span>
            <SiteLink href={model.card} target="_blank" rel="noreferrer">
              Publisher model card
              <ArrowUpRight size={13} />
            </SiteLink>
          </div>
        </div>
        <div className="v2-hero-actions">
          {report && (
            <Button
              variant="outline"
              onClick={() =>
                downloadJson(report, `browser-bench-${report.id}.json`)
              }
            >
              <Download size={15} />
              Export report
            </Button>
          )}
          {artifact.runnable && (
            <Button asChild>
              <SiteLink
                href={`/run/?artifact=${encodeURIComponent(artifact.model_id)}`}
              >
                <Play size={14} />
                Run benchmark
              </SiteLink>
            </Button>
          )}
        </div>
      </div>
      <div className="v2-run-bar">
        <span
          className={`v2-tag ${report?.status === "complete" ? "v2-good" : ""}`}
        >
          {report ? (
            <>
              <CheckCircle2 size={13} />
              {report.nativeTrace?.gpuValidation
                ? "GPU validation capture"
                : report.status === "complete"
                  ? "Completed run"
                  : report.status}
            </>
          ) : source === "illustrative" ? (
            "Illustrative preview"
          ) : (
            "No saved measurement"
          )}
        </span>
        <strong>
          {p?.plan.mode === "timed"
            ? `${p.plan.activeLimitMs! / 60000}-minute ${p.plan.sessionSchedule ? "intermittent session" : "inference test"}`
            : p?.plan.countSchedule
              ? "60-request session · 3 × 20"
              : row
                ? workloadLabel(row.workload)
                : "No run selected"}
        </strong>
        <span>
          {measured.length} {report ? "measured" : "synthetic"} requests
        </span>
        <span>
          {report
            ? new Date(report.createdAt).toLocaleString(undefined, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
            : "Synthetic data"}
        </span>
        <SiteLink href="/local-results/">
          Browse saved reports
          <ArrowUpRight size={13} />
        </SiteLink>
      </div>
      <div className="v2-config-summary">
        <Card>
          <CardHeader>
            <CardDescription>
              <Cpu size={15} />
              Runtime
            </CardDescription>
            <CardTitle>
              {report?.runtime ?? row?.runtime ?? "Not recorded"}
            </CardTitle>
            <CardDescription>
              {report
                ? `${report.executionBackend.toUpperCase()} · dedicated worker`
                : "Selected evidence configuration"}
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              <Layers size={15} />
              Model configuration
            </CardDescription>
            <CardTitle>
              {artifact.encoding === "q0f16" ? "FP16" : artifact.encoding}
              <small> · {parameterLabel(model.parameters)}</small>
            </CardTitle>
            <CardDescription>
              {(
                report?.settings.contextWindow ??
                artifact.overrides?.context_window_size
              )?.toLocaleString() ?? "Unknown"}{" "}
              token context window
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              <Timer size={15} />
              Measured workload
            </CardDescription>
            <CardTitle>
              {measured.length}
              <small> requests</small>
            </CardTitle>
            <CardDescription>
              {activeMs !== null
                ? `${secondsLabel(activeMs)} ${p?.plan.sessionSchedule || p?.plan.countSchedule ? "including pauses" : "active"}`
                : "Active duration not recorded"}{" "}
              · {report?.samples.filter((s) => s.warmup).length ?? 0} warmup
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>
              <Settings2 size={15} />
              Generation settings
            </CardDescription>
            <CardTitle>
              {report?.settings.maxTokens ?? "—"}
              <small> token limit</small>
            </CardTitle>
            <CardDescription>
              {report
                ? `Temperature ${report.settings.temperature} · top-p ${report.settings.topP} · seed ${report.settings.seed}`
                : "Not recorded for this selection"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
      <p className="v2-evidence-note">
        {report
          ? report.nativeTrace?.gpuValidation
            ? "Diagnostic capture with Metal System Trace active. Timings include profiler overhead and are not a performance baseline. Warmup is excluded."
            : "One saved run. Performance summaries exclude warmup; imported evidence is user supplied."
          : source === "illustrative"
            ? "Illustrative data only. These values demonstrate the interface, not measured model performance."
            : "This selection has no saved report. Missing measurements stay unavailable."}
      </p>
      <div className="v2-section-layout">
        <nav className="v2-section-nav" aria-label="Model sections">
          {sections.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={activeSection === id ? "location" : undefined}
              onClick={() => go(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>
        <div className="v2-section-content">
          <section id="v2-performance">
            <SectionTitle
              number="01"
              title="Performance"
              description="From loading the engine to finishing a response."
            />
            <PerformanceWorkspace
              key={report?.id ?? row?.id}
              samples={report?.samples ?? row?.samples ?? []}
              recorded={!!report}
            />
            <Card className="v2-startup">
              <CardHeader>
                <CardTitle>
                  <h3>Startup & cache</h3>
                </CardTitle>
                <CardDescription>
                  Loading is measured separately from request performance.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Facts
                  items={[
                    ["Engine ready", secondsLabel(row?.loadMs ?? null)],
                    [
                      "First preparation",
                      secondsLabel(report?.firstPreparationMs ?? null),
                    ],
                    ["Cache observation", report?.cache ?? "Not recorded"],
                  ]}
                />
                <Accordion type="single" collapsible>
                  <AccordionItem value="startup">
                    <AccordionTrigger>
                      Timing boundaries & network evidence
                    </AccordionTrigger>
                    <AccordionContent>
                      <p>
                        Engine startup combines network or cache reads and
                        initialization. First preparation is the whole warmup
                        response, not compilation alone. Cache observation does
                        not establish a fully cold or fully cached run.
                      </p>
                      <Facts
                        items={[
                          [
                            "Transfer-only duration",
                            secondsLabel(row?.downloadMs ?? null),
                          ],
                          [
                            "Initialization alone",
                            secondsLabel(row?.initMs ?? null),
                          ],
                          [
                            "Transferred bytes",
                            bytesLabel(report?.downloadBytes ?? null),
                          ],
                          [
                            "Network entries",
                            p?.network.entries ?? "Not recorded",
                          ],
                        ]}
                      />
                      {p && <p>{p.network.note}</p>}
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </section>
          <section id="v2-resources">
            <SectionTitle
              number="02"
              title="Resources over time"
              description="Separate what the browser uses from what the whole machine is doing."
            />
            {report ? (
              <ResourceWorkspace key={report.id} report={report} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>No resource capture</CardTitle>
                  <CardDescription>
                    Choose a saved report with profiling data. Synthetic traces
                    are not supplied.
                  </CardDescription>
                </CardHeader>
              </Card>
            )}
          </section>
          <section id="v2-requests">
            <SectionTitle
              number="03"
              title="Requests & repeated use"
              description="The distribution behind the headline. Every prompt and output stays inspectable."
            />
            <div className="v2-request-summary">
              <div>
                <strong>
                  {valid.length} / {measured.length}
                </strong>
                <span>valid measured outputs</span>
              </div>
              <div>
                <strong>
                  {row ? `${row.completed} / ${row.attempts}` : "—"}
                </strong>
                <span>completed / attempted runs in this cohort</span>
              </div>
              <div>
                <strong>
                  {p
                    ? p.unloadConfirmed
                      ? "Confirmed"
                      : "Not confirmed"
                    : "Not recorded"}
                </strong>
                <span>model unload</span>
              </div>
              <div>
                <strong>{secondsLabel(p?.totalMs ?? null)}</strong>
                <span>total run, including setup & cleanup</span>
              </div>
            </div>
            <RequestExplorer
              key={report?.id ?? row?.id}
              samples={report?.samples ?? row?.samples ?? []}
            />
            {report && (
              <Accordion type="single" collapsible>
                <AccordionItem value="diagnostics">
                  <AccordionTrigger>
                    Run diagnostics & lifecycle events
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul>
                      {report.diagnostics.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                    {p && (
                      <>
                        <p>Stop reason: {p.stopReason}</p>
                        <ul>
                          {p.events
                            .filter(
                              (e) =>
                                ![
                                  "phase",
                                  "request-start",
                                  "request-end",
                                ].includes(e.type),
                            )
                            .map((e, i) => (
                              <li key={i}>
                                {secondsLabel(e.tMs)} · {e.type} · {e.label}
                              </li>
                            ))}
                        </ul>
                      </>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}
          </section>
          <section id="v2-configuration">
            <SectionTitle
              number="04"
              title="Configuration & environment"
              description="The settings that produced this result, with the source of each hardware detail."
            />
            <div className="v2-settings-grid">
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>Runtime & model</h3>
                  </CardTitle>
                  <CardDescription>
                    Execution and prepared artifact
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Facts
                    items={[
                      [
                        "Runtime",
                        report?.runtime ?? row?.runtime ?? "Not recorded",
                      ],
                      [
                        "Backend",
                        report?.executionBackend.toUpperCase() ??
                          "Not recorded",
                      ],
                      [
                        "Execution",
                        report ? "Dedicated Web Worker" : "Not recorded",
                      ],
                      ["Parameters", parameterLabel(model.parameters)],
                      ["Weight format", precision[artifact.encoding]],
                      [
                        "Weight files",
                        bytesLabel(p?.artifact.weightShardBytes ?? null),
                      ],
                      [
                        "Configured context",
                        numberLabel(
                          report?.settings.contextWindow ??
                            artifact.overrides?.context_window_size ??
                            null,
                          "tokens",
                          0,
                        ),
                      ],
                      [
                        "Largest valid input",
                        numberLabel(row?.testedInput ?? null, "tokens", 0),
                      ],
                    ]}
                  />
                  <p className="v2-chart-note">
                    Weight files are not runtime memory. Largest valid input is
                    a tested point, not a proven context limit.
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>Workload & sampling</h3>
                  </CardTitle>
                  <CardDescription>
                    Configured limits versus actual execution
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Facts
                    items={[
                      [
                        "Workload",
                        row ? workloadLabel(row.workload) : "Not recorded",
                      ],
                      ["Completed requests", measured.length],
                      [
                        "Warmups recorded",
                        report?.samples.filter((s) => s.warmup).length ??
                          "Not recorded",
                      ],
                      [
                        p?.plan.mode === "timed"
                          ? "Request safety cap"
                          : "Configured repeats",
                        report?.settings.repeats ?? "Not recorded",
                      ],
                      [
                        p?.plan.sessionSchedule
                          ? "Session target (with pauses)"
                          : "Active target",
                        p?.plan.activeLimitMs
                          ? secondsLabel(p.plan.activeLimitMs)
                          : p
                            ? `${p.plan.measuredRequests} requests`
                            : "Not recorded",
                      ],
                      [
                        "Request pacing",
                        p?.plan.sessionSchedule
                          ? p.plan.sessionSchedule.requestGapMs === 0
                            ? "Sequential · no added delay"
                            : `${p.plan.sessionSchedule.requestGapMs / 1000} s between requests`
                          : "Sequential · no added delay",
                      ],
                      [
                        "Request windows",
                        p?.plan.countSchedule
                          ? "3 × 20 responses"
                          : p?.plan.sessionSchedule
                            ? "3 × 40 seconds"
                            : "One window",
                      ],
                      [
                        "Loaded-idle gaps",
                        p?.plan.countSchedule || p?.plan.sessionSchedule
                          ? "2 × 90 seconds"
                          : "None scheduled",
                      ],
                      [
                        "Reasoning mode",
                        report?.settings.thinkingMode === "disabled"
                          ? "Disabled explicitly"
                          : report?.settings.thinkingMode === "enabled"
                            ? "Enabled explicitly"
                            : "Not applicable / not recorded",
                      ],
                      [
                        "Output limit",
                        report
                          ? `${report.settings.maxTokens} tokens`
                          : "Not recorded",
                      ],
                      [
                        "Temperature / top-p",
                        report
                          ? `${report.settings.temperature} / ${report.settings.topP}`
                          : "Not recorded",
                      ],
                      ["Seed", report?.settings.seed ?? "Not recorded"],
                      [
                        "Warmup token limit",
                        report
                          ? `${report.settings.warmupTokens ?? 16} tokens`
                          : "Not recorded",
                      ],
                      [
                        "Request timeout",
                        p
                          ? `${p.plan.requestLimitMs / 1000} seconds`
                          : "Not recorded",
                      ],
                      ["Chat reset", p?.plan.resetPolicy ?? "Not recorded"],
                    ]}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>Browser & device</h3>
                  </CardTitle>
                  <CardDescription>
                    Captured environment, not reserved capacity
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Facts
                    items={[
                      ["Browser", row?.browser ?? "Not recorded"],
                      ["Operating system", osLabel(report)],
                      [
                        "Logical CPUs",
                        report?.nativeTrace?.logicalCpus ??
                          report?.environment.hardwareConcurrency ??
                          "Not recorded",
                      ],
                      ["GPU adapter hint", gpuLabel(row?.gpu)],
                      [
                        "Device label",
                        report?.environment.deviceLabel ?? "Not recorded",
                      ],
                      ["Installed RAM", "Not recorded"],
                      [
                        "Resource allocation",
                        "Browser-managed; no reservation",
                      ],
                      [
                        "Native instrumentation",
                        report?.nativeTrace ? "Attached" : "Not attached",
                      ],
                    ]}
                  />
                  <p className="v2-chart-note">
                    Device label is user supplied. Browser identity may be
                    reduced. Adapter hints do not establish exact GPU model or
                    core count.
                  </p>
                </CardContent>
              </Card>
            </div>
            <Accordion type="single" collapsible>
              <AccordionItem value="provenance">
                <AccordionTrigger>
                  Exact artifact, browser identity & reproducibility
                </AccordionTrigger>
                <AccordionContent>
                  <Facts
                    items={[
                      ["Artifact", artifact.model_id],
                      ["Revision", row?.revision ?? "Not recorded"],
                      ["Runtime binary", report?.modelLib ?? "Not recorded"],
                      [
                        "Weight manifest SHA-256",
                        p?.artifact.manifestSha256 ?? "Not recorded",
                      ],
                      ["GPU adapter details", row?.gpu ?? "Not recorded"],
                      [
                        "Browser user agent",
                        report?.environment.userAgent ?? "Not recorded",
                      ],
                      [
                        "Reported platform",
                        report?.environment.platform ?? "Not recorded",
                      ],
                      ["Protocol", report?.protocol ?? "Not recorded"],
                    ]}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            <Card className="v2-evidence-card">
              <CardHeader>
                <CardTitle>
                  <h3>Keep the evidence close</h3>
                </CardTitle>
                <CardDescription>
                  This view reuses the original saved report. No measurements
                  have been changed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="v2-evidence-actions">
                  {report && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => onReport(report)}
                      >
                        <FileText size={14} />
                        Inspect original report
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() =>
                          downloadJson(
                            report,
                            `browser-bench-${report.id}.json`,
                          )
                        }
                      >
                        <Download size={14} />
                        Export JSON
                      </Button>
                    </>
                  )}
                  <SiteLink href="/methodology/">
                    Measurement methodology
                    <ArrowUpRight size={14} />
                  </SiteLink>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </article>
  );
}
