"use client";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Cpu,
  ListChecks,
  Play,
  Square,
} from "lucide-react";
import { useState } from "react";
import candidates from "../../../catalog/candidates.json";
import type { RepeatMode } from "../../benchmark/protocol/schedule";
import { durationLabel, planFor } from "../../benchmark/protocol/schedule";
import type { RunSettings } from "../../benchmark/protocol/settings";
import {
  defaultRunSettings,
  runSettingsSchema,
} from "../../benchmark/protocol/settings";
import { workload, workloadOptions } from "../../benchmark/protocol/workloads";
import live, { modelGroups } from "../../benchmark/runtime/catalog";
import type { Report } from "../../benchmark/schemas/report";
import { MODEL } from "../../benchmark/schemas/report";
import { ProviderLogo } from "../../components/ProviderLogo";
import { SiteLink } from "../../components/SiteLink";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/ui/accordion";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { downloadJson } from "../../lib/download";
import {
  BrowserCapabilitiesCard,
  useBrowserCapabilities,
} from "../capabilities/BrowserCapabilitiesCard";
import { bytesLabel, precision } from "../leaderboard/data";
import { ProfileTimeline } from "./ProfileTimeline";
import "./runner.css";
import { useBenchmark } from "./useBenchmark";
export default function Runner({
  onReport,
  initialModel = MODEL,
}: {
  onReport: (r: Report) => void;
  initialModel?: string;
}) {
  const browserCapabilities = useBrowserCapabilities();
  const [modelId, setModelId] = useState(
    live.models.some((m) => m.id === initialModel) ? initialModel : MODEL,
  );
  const [selection, setSelection] = useState(
    live.models.find((m) => m.id === initialModel)?.slug ??
      live.models.find((m) => m.id === MODEL)!.slug,
  );
  const pin = live.models.find((m) => m.id === modelId && m.slug === selection);
  const variants = live.models.filter((m) => m.slug === selection);
  const candidate = candidates.find((m) => `candidate:${m.name}` === selection);
  const [search, setSearch] = useState("");
  const [settings, setSettings] = useState<RunSettings>(
    defaultRunSettings("repeat"),
  );
  const [runError, setRunError] = useState("");
  const allModels = [
    ...modelGroups.map((m) => ({ ...m, available: true })),
    ...candidates
      .filter(
        (m) =>
          !m.artifactIds.some((id) => live.models.some((p) => p.id === id)),
      )
      .map((m) => ({ ...m, slug: `candidate:${m.name}`, available: false })),
  ];
  const filteredModels = allModels.filter(
    (m) =>
      m.slug === selection ||
      `${m.name} ${m.family}`.toLowerCase().includes(search.toLowerCase()),
  );
  function selectModel(slug: string) {
    setSelection(slug);
    setRunError("");
    const next = live.models.filter((m) => m.slug === slug);
    setModelId(
      (next.find((m) => m.quantization === "q4f16_1") ?? next[0])?.id ?? "",
    );
    setSettings((s) => ({ ...s, thinking: false }));
  }
  function updateSetting(key: keyof RunSettings, value: number) {
    setSettings((s) => ({ ...s, [key]: value }));
  }
  function changeWork(value: string) {
    setWork(value);
    setSettings((s) => ({
      ...s,
      maxTokens: defaultRunSettings(value).maxTokens,
    }));
  }
  function numberField(
    label: string,
    key: Exclude<keyof RunSettings, "thinking">,
    min: number,
    max: number,
    step = 1,
  ) {
    return (
      <label>
        {label}
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={Number.isNaN(settings[key]) ? "" : settings[key]}
          onChange={(e) => updateSetting(key, e.target.valueAsNumber)}
        />
      </label>
    );
  }
  const [work, setWork] = useState("repeat"),
    [device, setDevice] = useState("This device"),
    [repeatMode, setRepeatMode] = useState<RepeatMode>("session-count"),
    [profiling, setProfiling] = useState(true);
  const {
    capability,
    supported,
    gpuFeatures,
    maxBufferSize,
    active,
    cancelling,
    phase,
    progress,
    output,
    last,
    elapsed,
    completed,
    current,
    run: begin,
    stop,
  } = useBenchmark(onReport);
  const validation = runSettingsSchema.safeParse(settings);
  const validationError = validation.success
    ? ""
    : validation.error.issues
        .map((i) => `${i.path.join(" ")}: ${i.message}`)
        .join(" ");
  const missing =
    pin?.requiredFeatures.filter((f) => !gpuFeatures.includes(f)) ?? [];
  const compatible =
    !!pin &&
    supported &&
    !missing.length &&
    maxBufferSize >= pin.bufferSizeRequiredBytes;
  const compatibility = !supported
    ? capability
    : missing.length
      ? `Requires ${missing.join(", ")}; choose an FP32-compute variant`
      : pin && maxBufferSize < pin.bufferSizeRequiredBytes
        ? "GPU buffer limit is too small for this artifact"
        : capability;
  const plan = planFor(work, repeatMode, {
    requestLimitMs: settings.requestLimitMs,
    seed: settings.seed,
  });
  const observedPlan = current?.profile?.plan ?? last?.profile?.plan ?? plan;
  const run = () => {
    if (!pin || !validation.success) return;
    setRunError("");
    try {
      begin(
        work,
        repeatMode,
        profiling,
        device,
        modelId,
        validation.data,
        browserCapabilities.value ?? undefined,
      );
    } catch (e) {
      setRunError(String(e));
    }
  };
  return (
    <>
      <div className="section-kicker">YOUR DEVICE, YOUR EVIDENCE</div>
      <div className="page-heading">
        <div>
          <h1>Measure the browser.</h1>
          <p>Choose a model, its weight format and a reproducible workload.</p>
        </div>
        <div className="toolbar-actions">
          <Button asChild variant="outline">
            <SiteLink href="/local-results/">
              Local results <ArrowUpRight size={15} />
            </SiteLink>
          </Button>
          <span className="badge green">
            <span className="dot" /> Private browser run
          </span>
        </div>
      </div>
      <BrowserCapabilitiesCard {...browserCapabilities} active={active} />
      <div className="runner-grid runner-layout">
        <section className="panel run-config">
          <div className="panel-heading">
            <h2>Configure a run</h2>
            <Cpu size={20} />
          </div>
          <p className="runner-local-note">
            Your results stay in this browser. View or download the report when
            the run ends; nothing is added to the public leaderboard.
          </p>
          <label>
            Find a model
            <Input
              type="search"
              placeholder="Search models or creators…"
              value={search}
              disabled={active}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="runner-select-field">
            <span>Model</span>
            <Select
              label="Model"
              disabled={active}
              value={selection}
              onValueChange={selectModel}
              options={filteredModels.map((m) => ({
                value: m.slug,
                label: m.name,
                visual: <ProviderLogo family={m.family} model={m.name} />,
                description: `${m.family} · ${m.parameters.toLocaleString(undefined, { maximumFractionDigits: 2 })}B parameters${m.available ? "" : " · runtime integration needed"}`,
                group: m.available ? "Browser packages" : "Research candidates",
              }))}
            />
          </div>
          <small className="field-note">
            {filteredModels.length} matching models · {modelGroups.length} with
            browser packages · {candidates.length} researched candidates at or
            below 8B
          </small>
          {pin ? (
            <>
              <div className="runner-select-field">
                <span>Weight encoding</span>
                <Select
                  label="Weight encoding"
                  disabled={active}
                  value={modelId}
                  onValueChange={setModelId}
                  options={variants.map((m) => ({
                    value: m.id,
                    label: precision[m.quantization] ?? m.quantization,
                    description: `${m.quantization} · ${bytesLabel(m.artifact.weightShardBytes)} weights`,
                  }))}
                />
              </div>
              <div className="runner-artifact">
                <ProviderLogo family={pin.family} model={pin.name} />
                <div>
                  <strong>{pin.name}</strong>
                  <span>{pin.runtime} · WebGPU · dedicated worker</span>
                </div>
              </div>
              <dl className="runner-facts">
                <div>
                  <dt>Weight files</dt>
                  <dd>{bytesLabel(pin.artifact.weightShardBytes)}</dd>
                </div>
                <div>
                  <dt>Estimated GPU memory</dt>
                  <dd>
                    {pin.estimatedVramMB
                      ? bytesLabel(pin.estimatedVramMB * 1e6)
                      : "Not published"}
                  </dd>
                </div>
              </dl>
              <p className="field-note">
                {pin.validationStatus === "benchmarked"
                  ? "Previously benchmarked artifact."
                  : "Published browser package; not part of the published benchmark set."}{" "}
                Memory is a catalog estimate, not a reservation or a
                measurement.
              </p>
              <div className="capability">
                <span
                  className={"status-dot " + (compatible ? "ok" : "warn")}
                />
                <div>
                  <strong>{compatibility}</strong>
                  <small>
                    Capability detection does not guarantee that the model fits
                    or runs successfully.
                  </small>
                </div>
              </div>
            </>
          ) : (
            <div className="runner-unavailable" role="status">
              {candidate && (
                <div className="runner-artifact">
                  <ProviderLogo
                    family={candidate.family}
                    model={candidate.name}
                  />
                  <div>
                    <strong>{candidate.name}</strong>
                    <span>{candidate.family}</span>
                  </div>
                </div>
              )}
              <h3>Runtime integration needed</h3>
              <p>
                {candidate?.name} has no verified WebLLM package in this
                catalog. It can be selected for planning, but cannot run in this
                harness yet.
              </p>
              <p>
                <strong>Published GGUF formats:</strong>{" "}
                {candidate?.gguf.join(", ") || "None verified"}
              </p>
              <p>
                <strong>ONNX artifacts:</strong>{" "}
                {candidate?.onnx
                  ? "Found; browser compatibility not yet validated"
                  : "None verified"}
              </p>
              <SiteLink
                className="text-link"
                href={candidate?.card}
                target="_blank"
                rel="noreferrer"
              >
                View source model <ArrowUpRight size={14} />
              </SiteLink>
            </div>
          )}
          <fieldset disabled={active || !pin} className="runner-fields">
            <div className="runner-select-field">
              <span>Workload</span>
              <Select
                icon={ListChecks}
                label="Workload"
                disabled={active || !pin}
                value={work}
                onValueChange={changeWork}
                options={workloadOptions.map((w) => ({
                  value: w.id,
                  label: w.name,
                  description: w.detail,
                }))}
              />
            </div>
            {work === "repeat" && (
              <div className="runner-select-field">
                <span>Run schedule</span>
                <Select
                  label="Run schedule"
                  disabled={active || !pin}
                  value={repeatMode}
                  onValueChange={(v) => setRepeatMode(v as RepeatMode)}
                  options={[
                    {
                      value: "session-count",
                      label: "Comparison · 60 requests",
                      description:
                        "3 × 20 requests, with two full 90-second idle gaps",
                    },
                    { value: "smoke", label: "Smoke test · 3 requests" },
                    { value: "standard", label: "Standard · 10 requests" },
                    { value: "extended", label: "Extended · 100 requests" },
                    { value: "minute", label: "Continuous · 1 minute" },
                    {
                      value: "session",
                      label: "Intermittent · 3 × 40 seconds",
                      description:
                        "Two scheduled 90-second gaps; 5-minute use session",
                    },
                    { value: "timed", label: "Continuous · 8 minutes" },
                  ]}
                />
              </div>
            )}
            <div className="runner-schedule">
              <strong>
                {plan.countSchedule
                  ? "20 requests → 90 s idle → 20 → 90 s idle → 20"
                  : plan.sessionSchedule
                    ? "40 s use → 90 s idle → 40 s use → 90 s idle → 40 s use"
                    : plan.mode === "count"
                      ? `${plan.measuredRequests} measured request${plan.measuredRequests === 1 ? "" : "s"}`
                      : `${plan.activeLimitMs! / 60000} minute${plan.activeLimitMs! > 60000 ? "s" : ""} of continuous requests`}
              </strong>
              <p>
                One request at a time, back-to-back within each window. Chat
                resets before every request; the model stays loaded between
                windows.
              </p>
            </div>
            <Accordion
              type="multiple"
              defaultValue={["generation"]}
              className="runner-options"
            >
              <AccordionItem value="generation">
                <AccordionTrigger>Generation settings</AccordionTrigger>
                <AccordionContent>
                  <div className="runner-field-grid">
                    {numberField("Output token limit", "maxTokens", 1, 2048)}
                    <div className="runner-select-field">
                      <span>Context window</span>
                      <Select
                        label="Context window"
                        disabled={active || !pin}
                        value={String(settings.contextWindow)}
                        onValueChange={(v) =>
                          updateSetting("contextWindow", Number(v))
                        }
                        options={[512, 1024, 2048, 4096].map((n) => ({
                          value: String(n),
                          label: `${n.toLocaleString()} tokens`,
                        }))}
                      />
                    </div>
                    {numberField("Temperature", "temperature", 0, 2, 0.1)}
                    {numberField("Top-p", "topP", 0.01, 1, 0.05)}
                    {numberField("Seed", "seed", 0, 2147483647)}
                    <div className="runner-select-field">
                      <span>Thinking</span>
                      <Select
                        label="Thinking"
                        disabled={active || !pin?.thinkingDisabled}
                        value={
                          pin?.thinkingDisabled && settings.thinking
                            ? "on"
                            : "off"
                        }
                        onValueChange={(v) =>
                          setSettings((s) => ({ ...s, thinking: v === "on" }))
                        }
                        options={[
                          {
                            value: "off",
                            label: pin?.thinkingDisabled
                              ? "Disabled"
                              : "Not configurable",
                          },
                          {
                            value: "on",
                            label: "Enabled",
                            disabled: !pin?.thinkingDisabled,
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <p className="field-note">
                    The context budget includes the prompt and output. Output
                    may end before the token limit. Changed settings create a
                    different comparison setup.
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    disabled={active}
                    onClick={() => setSettings(defaultRunSettings(work))}
                  >
                    Reset generation & safety defaults
                  </Button>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="capture">
                <AccordionTrigger>Warmup, resources & safety</AccordionTrigger>
                <AccordionContent>
                  <div className="runner-field-grid">
                    {numberField("Warmup requests", "warmups", 0, 5)}
                    {numberField("Warmup token limit", "warmupTokens", 1, 256)}
                    <label>
                      Request timeout (seconds)
                      <Input
                        type="number"
                        min={10}
                        max={600}
                        step={1}
                        value={settings.requestLimitMs / 1000}
                        onChange={(e) =>
                          updateSetting(
                            "requestLimitMs",
                            e.target.valueAsNumber * 1000,
                          )
                        }
                      />
                    </label>
                    <label>
                      Device label
                      <Input
                        value={device}
                        maxLength={120}
                        onChange={(e) => setDevice(e.target.value)}
                      />
                    </label>
                  </div>
                  <label className="profiling-switch">
                    <input
                      type="checkbox"
                      checked={profiling}
                      onChange={(e) => setProfiling(e.target.checked)}
                    />
                    Sample browser resources every second
                  </label>
                  <p className="field-note">
                    Browser capture includes exposed memory, tracked GPU buffers
                    and responsiveness. Native process GPU counters and host
                    power require the separate native collector; this page does
                    not enable them.
                  </p>
                  <p className="field-note">
                    {plan.baselineMs / 1000} s baseline → load →{" "}
                    {settings.warmups} warmup(s) → measured requests →{" "}
                    {plan.idleMs / 1000} s loaded idle → unload →{" "}
                    {plan.recoveryMs / 1000} s observation. Warmups are excluded
                    from performance results.
                  </p>
                  <p className="field-note">
                    {plan.totalLimitMs / 60000}-minute total limit including
                    setup.{" "}
                    {plan.mode === "timed"
                      ? "1,000-request safety ceiling. "
                      : ""}
                    {plan.sessionSchedule || plan.countSchedule
                      ? "Hidden-page periods are recorded; browser throttling can affect results."
                      : "Switching away from this tab interrupts the run."}{" "}
                    CPU, RAM and GPU are managed by the browser.
                  </p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="prompt">
                <AccordionTrigger>Exact prompts & artifact</AccordionTrigger>
                <AccordionContent>
                  {(work === "repeat"
                    ? workload(work).slice(0, 1)
                    : workload(work)
                  ).map((p, i) => (
                    <pre className="runner-prompt" key={i}>
                      {p}
                    </pre>
                  ))}
                  <p className="field-note">
                    Warmup prompt: “Say hello in one short sentence.”
                  </p>
                  {pin && (
                    <dl className="runner-pin">
                      <dt>Artifact</dt>
                      <dd>{pin.id}</dd>
                      <dt>Weight revision</dt>
                      <dd>{pin.revision}</dd>
                      <dt>Sources</dt>
                      <dd>
                        <SiteLink
                          href={pin.card}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Model card
                        </SiteLink>{" "}
                        ·{" "}
                        <SiteLink
                          href={pin.artifact.manifestUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Weight manifest
                        </SiteLink>{" "}
                        ·{" "}
                        <SiteLink
                          href={pin.modelLib}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Compiled library
                        </SiteLink>
                      </dd>
                    </dl>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </fieldset>
          {validationError && (
            <p role="alert" className="error">
              {validationError}
            </p>
          )}
          {runError && (
            <p role="alert" className="error">
              {runError}
            </p>
          )}
          <div className="runner-start">
            {active ? (
              <Button
                variant="outline"
                onClick={() => stop()}
                disabled={cancelling}
              >
                <Square size={15} />
                {cancelling ? "Stopping…" : "Cancel run"}
              </Button>
            ) : (
              <Button onClick={run} disabled={!pin || !!validationError}>
                <Play size={15} />
                {!pin
                  ? "Integration required"
                  : compatible
                    ? "Run benchmark"
                    : "Check & record unsupported"}
              </Button>
            )}
            <small>
              Weights download only when you run. Cached files may be reused.
            </small>
          </div>
        </section>
        <section className="panel run-output">
          <div className="panel-heading">
            <h2>Run monitor</h2>
            <span className="mono muted">
              {active ? "RUNNING" : last ? last.status.toUpperCase() : "IDLE"}
            </span>
          </div>
          <div className="monitor-state" role="status" aria-live="polite">
            <div className={"monitor-icon " + (active ? "spinning" : "")}>
              {last?.status === "complete" ? (
                <Check />
              ) : last ? (
                <AlertCircle />
              ) : (
                <Cpu />
              )}
            </div>
            <h3>{phase}</h3>
            <p>
              {active
                ? "All model computation is happening in this browser."
                : last
                  ? "The report includes timing boundaries, settings and diagnostics."
                  : "One model. A reproducible protocol. Measurements you can inspect."}
            </p>
          </div>
          <div className="run-session-progress">
            <strong>{durationLabel(elapsed)} total</strong>
            <span>
              {completed} /{" "}
              {observedPlan.mode === "timed"
                ? `${observedPlan.activeLimitMs! / 60000}-minute ${observedPlan.sessionSchedule || observedPlan.countSchedule ? "session" : "active"} window`
                : observedPlan.measuredRequests}{" "}
              measured requests
              {current?.profile?.activeStartedMs != null
                ? ` · ${durationLabel((current.profile.activeEndedMs ?? elapsed) - current.profile.activeStartedMs)} ${observedPlan.sessionSchedule || observedPlan.countSchedule ? "session" : "active"}`
                : ""}
            </span>
          </div>
          <progress
            aria-label="Model load progress"
            value={progress}
            max={100}
          />
          <div className="output-label">
            <span>GENERATED OUTPUT</span>
            <span>Not a quality evaluation</span>
          </div>
          <pre className="output">
            {output || "Model output will appear here during the run."}
          </pre>
          {last && (
            <>
              <div className="run-metrics">
                <div>
                  <small>Engine ready</small>
                  <strong>
                    {last.loadMs === null
                      ? "—"
                      : (last.loadMs / 1000).toFixed(2) + " s"}
                  </strong>
                </div>
                <div>
                  <small>First output¹</small>
                  <strong>
                    {last.samples
                      .find((s) => !s.warmup)
                      ?.firstOutputMs?.toFixed(0) ?? "—"}{" "}
                    ms
                  </strong>
                </div>
                <div>
                  <small>Decode speed²</small>
                  <strong>
                    {last.samples
                      .find((s) => !s.warmup)
                      ?.decodeTokensPerSecond?.toFixed(1) ?? "—"}{" "}
                    tok/s
                  </strong>
                </div>
              </div>
              <div className="runner-result-actions">
                <Button asChild>
                  <SiteLink href={`#/local-report/${last.id}`}>
                    View report <ArrowUpRight size={15} />
                  </SiteLink>
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    downloadJson(last, `browser-llm-bench-${last.id}.json`)
                  }
                >
                  Download report <ArrowUpRight size={15} />
                </Button>
              </div>
              <p className="field-note">
                Saved only in this browser. This run does not change the
                leaderboard.
              </p>
              {last.status !== "complete" && (
                <p className="error">{last.diagnostics.at(-1)}</p>
              )}
            </>
          )}
        </section>
      </div>
      <section className="panel prompt-panel">
        <h2>What gets measured</h2>
        <p>
          ¹ Request dispatch inside the worker to the first non-empty streamed
          text. This may contain multiple tokens. ² WebLLM’s tokenizer-based
          autoregressive decode throughput, never stream chunks per second.
        </p>
        <p>
          Actual token counts, finish reasons, warmups and timing boundaries are
          saved with the report. A completed request passes a basic output
          check; it is not a quality or intelligence score.
        </p>
      </section>
      {(current?.profile || last?.profile) && (
        <ProfileTimeline report={current ?? last!} live={active} />
      )}
    </>
  );
}
