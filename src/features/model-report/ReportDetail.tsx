"use client";
import { Download } from "lucide-react";
import type { Report } from "../../benchmark/schemas/report";
import { Button } from "../../components/ui/button";

import { Status } from "../../components/Status";
import { downloadJson } from "../../lib/download";
export function ReportDetail({ report: r }: { report: Report }) {
  return (
    <>
      <dl className="detail-grid">
        <dt>Status</dt>
        <dd>
          <Status value={r.status} />
        </dd>
        <dt>Device</dt>
        <dd>{r.environment.deviceLabel} (user supplied label)</dd>
        <dt>Browser / OS</dt>
        <dd>{r.environment.userAgent}</dd>
        <dt>Adapter information</dt>
        <dd>
          {r.environment.adapter === "{}"
            ? "Not captured in this earlier report"
            : r.environment.adapter || "Not exposed"}
        </dd>
        <dt>Runtime / backend</dt>
        <dd>
          {r.runtime} / {r.executionBackend}
        </dd>
        <dt>Resource policy</dt>
        <dd>{r.resourcePolicy}</dd>
        <dt>Artifact revision</dt>
        <dd className="mono">{r.revision}</dd>
        <dt>Protocol / workload</dt>
        <dd>
          {r.protocol} / {r.workload}
        </dd>
        <dt>Weight cache</dt>
        <dd>{r.cache}</dd>
        <dt>Load → engine ready</dt>
        <dd>{r.loadMs?.toFixed(1) ?? "Unavailable"} ms</dd>
        <dt>First preparation</dt>
        <dd>
          {r.firstPreparationMs?.toFixed(1) ?? "Unavailable"} ms · warmup
          response
        </dd>
        <dt>Observed transfer</dt>
        <dd>
          {r.profile?.network.positiveTransferBytes != null
            ? `${(r.profile.network.positiveTransferBytes / 1e6).toFixed(2)} MB lower bound; not full weight file size`
            : "Unavailable; cache and hidden cross-origin sizes cannot be distinguished"}
        </dd>
        {r.profile && (
          <>
            <dt>Profile protocol</dt>
            <dd>
              {r.profile.plan.mode === "timed"
                ? `${r.profile.plan.activeLimitMs! / 60000}-minute ${r.profile.plan.sessionSchedule ? "intermittent session" : "active pilot"}`
                : `${r.profile.plan.measuredRequests} measured requests`}{" "}
              · {r.profile.points.length} resource samples · unload{" "}
              {r.profile.unloadConfirmed ? "confirmed" : "not confirmed"}
            </dd>
          </>
        )}
        <dt>JS heap estimate</dt>
        <dd>
          {r.memory.jsHeapBytes === null
            ? "Unavailable"
            : (r.memory.jsHeapBytes / 1e6).toFixed(1) + " MB"}{" "}
          · main page only
        </dd>
        <dt>GPU memory / energy / thermals</dt>
        <dd>Unavailable</dd>
        <dt>Max event-loop delay</dt>
        <dd>
          {r.responsiveness.maxEventLoopDelayMs.toFixed(1)} ms ·{" "}
          {r.responsiveness.samples} samples
        </dd>
      </dl>
      <h3>Request samples</h3>
      {r.samples.map((s, i) => (
        <details key={i} className="sample">
          <summary>
            {s.warmup ? "Warmup (excluded)" : `Measured request ${i}`} ·{" "}
            {s.inputTokens ?? "—"} → {s.outputTokens ?? "—"} tokens ·{" "}
            {s.valid ? "valid output" : "invalid output"}
          </summary>
          <p>
            First output: {s.firstOutputMs?.toFixed(1) ?? "—"} ms · response:{" "}
            {s.responseMs.toFixed(1)} ms · decode:{" "}
            {s.decodeTokensPerSecond?.toFixed(2) ?? "—"} tok/s · finish:{" "}
            {s.finishReason}
          </p>
          <h4>Prompt</h4>
          <pre>{s.prompt}</pre>
          <h4>Output</h4>
          <pre>{s.output}</pre>
        </details>
      ))}
      <h3>Diagnostics & limitations</h3>
      <ul>
        {r.diagnostics.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <Button
        onClick={() => downloadJson(r, `browser-inference-bench-${r.id}.json`)}
      >
        <Download size={15} />
        Export complete JSON
      </Button>
    </>
  );
}
